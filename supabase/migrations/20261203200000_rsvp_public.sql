-- FEAT-2026-004 / T2 - RSVP public surface: limiter table and the three public RPCs (plan "RPC
-- pubbliche", ADR-0003). Additive. Needs 20261203100000_rsvp.sql (rules, tables).
--
-- Security model (ADR-0003, read before touching):
--   * rsvp_gate / rsvp_page / rsvp_submit are SECURITY DEFINER and granted ONLY to service_role: the
--     public page reaches them through the secret key, never with a user's or anon's token.
--   * The caller passes sha256(token) (never the token) and the IP key (HMAC computed by the server,
--     null when the IP is unknown). `p_now` comes from the server clock only (resolveNow()), never
--     from the request.
--   * rsvp_page returns a CLOSED set of keys (AC3, proved by pgTAP). Everything that is not a working
--     link answers the same neutral `{ok:false}`, whatever the cause (AC6).
--   * rsvp_gate writes NOTHING (STABLE); opening a page writes nothing but the limiter counters.
--   * Limits (BR9): 10 invalid links per IP key / 15 min, then 15 min of block (a WORKING token is
--     never blocked by the IP limit); 20 submissions per link / 15 min. Counted BEFORE the writes under
--     a row lock, so parallel submissions can never exceed 20 writes (QA-9). Null IP key = no IP limit.
--   * The limiter table is its own (the login cleanup would shorten these windows).
--   * Error codes: P0001 `invalid_key` (bad IP key: a server bug), `invalid_answers` (bad payload on a
--     WORKING link). Anything else a caller could trigger returns the neutral `{ok:false}`.

create table private.rsvp_attempts (
  key_hash bytea primary key check (octet_length(key_hash) = 32),
  failed_count integer not null default 0 check (failed_count >= 0),
  window_start timestamptz not null default now(),
  locked_until timestamptz
);
create index rsvp_attempts_window_idx on private.rsvp_attempts (window_start);
alter table private.rsvp_attempts enable row level security;
revoke all on private.rsvp_attempts from public, anon, authenticated;

-- One hit on a key, atomically and race-free: the row is locked, then the decision is taken on it.
-- A locked key refuses (and is not extended); a finished window or lock restarts the count; reaching
-- p_max locks for p_lock. The hit that reaches p_max is still allowed (the next one is refused).
create function private.rsvp_hit(p_key bytea, p_max integer, p_window interval, p_lock interval)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  r private.rsvp_attempts;
begin
  insert into private.rsvp_attempts (key_hash) values (p_key) on conflict do nothing;
  select * into r from private.rsvp_attempts a where a.key_hash = p_key for update;
  if r.locked_until is not null and r.locked_until > now() then
    return query select false, ceil(extract(epoch from (r.locked_until - now())))::integer;
    return;
  end if;
  if r.locked_until is not null or r.window_start < now() - p_window then
    r.failed_count := 0;
    r.window_start := now();
    r.locked_until := null;
  end if;
  r.failed_count := r.failed_count + 1;
  if r.failed_count >= p_max then
    r.locked_until := now() + p_lock;
  end if;
  update private.rsvp_attempts a
  set failed_count = r.failed_count, window_start = r.window_start, locked_until = r.locked_until
  where a.key_hash = p_key;
  return query select true, 0;
end;
$$;

-- Own cleanup (never the login one): finished, unlocked rows older than the window. skip locked: never
-- wait for a concurrent hit.
create function private.rsvp_attempts_gc()
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  delete from private.rsvp_attempts a
  where a.key_hash in (
    select x.key_hash from private.rsvp_attempts x
    where x.window_start < now() - interval '15 minutes' and (x.locked_until is null or x.locked_until <= now())
    for update skip locked
  );
$$;

-- The link behind a hash, only if it WORKS now (BR1-BR4: not revoked, not expired, covering somebody).
create function private.rsvp_resolve(p_token_hash bytea, p_now timestamptz)
returns table (link_id uuid, wedding_id uuid)
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select l.id, l.wedding_id
  from public.rsvp_links l
  where p_token_hash is not null and l.token_hash = p_token_hash
    and exists (select 1 from private.rsvp_cover(l.wedding_id, l.id, p_now));
$$;

-- The people block of the page, and of the submit answer: nothing but these keys (AC3).
-- `answered_at` is the value the form sends back as `seen_at` (PO-1, P7).
create function private.rsvp_people_json(p_link uuid, p_wedding uuid, p_now timestamptz)
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'category', g.category,
      'status', r.status, 'diet', coalesce(to_jsonb(r.diet), '[]'::jsonb), 'diet_note', r.diet_note,
      'answered_at', r.answered_at) order by g.created_at, g.id), '[]'::jsonb)
  from private.rsvp_cover(p_wedding, p_link, p_now) c
  join public.guests g on g.id = c.guest_id and g.wedding_id = p_wedding
  left join public.rsvp_responses r on r.id = g.id and r.wedding_id = g.wedding_id;
$$;

-- One answer item is well formed (QA-8). Any cast failure is "not ok", never an error.
create function private.rsvp_item_ok(p_item jsonb)
returns boolean
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_diet jsonb := p_item -> 'diet';
  v_note jsonb := p_item -> 'diet_note';
  v_seen jsonb := p_item -> 'seen_at';
  v_st jsonb := p_item -> 'status';
begin
  if jsonb_typeof(p_item) <> 'object' or jsonb_typeof(p_item -> 'id') is distinct from 'string' then
    return false;
  end if;
  perform (p_item ->> 'id')::uuid;
  if v_st is not null and jsonb_typeof(v_st) <> 'null' and not (jsonb_typeof(v_st) = 'string' and (p_item ->> 'status') in ('yes', 'no')) then
    return false;
  end if;
  if v_diet is not null and jsonb_typeof(v_diet) <> 'null' then
    if jsonb_typeof(v_diet) <> 'array' or jsonb_array_length(v_diet) > 4
       or exists (select 1 from jsonb_array_elements(v_diet) d where jsonb_typeof(d) <> 'string'
                  or (d #>> '{}') not in ('vegetarian', 'vegan', 'gluten_free', 'lactose_free'))
       or (select count(distinct d #>> '{}') from jsonb_array_elements(v_diet) d) <> jsonb_array_length(v_diet) then
      return false;
    end if;
  end if;
  if v_note is not null and jsonb_typeof(v_note) <> 'null' then
    if jsonb_typeof(v_note) <> 'string' or char_length(v_note #>> '{}') > 200 or char_length(btrim(v_note #>> '{}')) < 1 then
      return false;
    end if;
  end if;
  if v_seen is not null and jsonb_typeof(v_seen) <> 'null' then
    if jsonb_typeof(v_seen) <> 'string' then return false; end if;
    perform (v_seen #>> '{}')::timestamptz;
  end if;
  return true;
exception when data_exception then
  return false;
end;
$$;

-- rsvp_gate(token_hash, ip_key, now) -> { blocked, retry_after_seconds, theme_id }   (proxy, AC10)
-- STABLE and writes nothing (QA-11). Blocked only when the IP key is locked AND the token does not work.
-- theme_id only for a working link (an unknown link never reveals a wedding's theme).
create function public.rsvp_gate(p_token_hash bytea, p_ip_key bytea default null, p_now timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_link record;
  v_until timestamptz;
begin
  if p_ip_key is not null and octet_length(p_ip_key) <> 32 then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;
  select * into v_link from private.rsvp_resolve(p_token_hash, p_now);
  if found then
    return jsonb_build_object('blocked', false, 'retry_after_seconds', 0,
      'theme_id', (select w.theme_id from public.weddings w where w.id = v_link.wedding_id));
  end if;
  if p_ip_key is not null then
    select a.locked_until into v_until from private.rsvp_attempts a
    where a.key_hash = p_ip_key and a.locked_until > now();
  end if;
  return jsonb_build_object('blocked', v_until is not null,
    'retry_after_seconds', case when v_until is null then 0 else ceil(extract(epoch from (v_until - now())))::integer end,
    'theme_id', null);
end;
$$;

-- rsvp_page(token_hash, ip_key, now) -> { ok:false } | { ok:true, couple, date, location, theme_id, people }
-- Closed key set (AC3). Date and location only when their decision is taken (BR8). A link that does not
-- work records one failure on the IP key (BR9) and answers the neutral { ok:false }.
create function public.rsvp_page(p_token_hash bytea, p_ip_key bytea default null, p_now timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_link record;
  v_w uuid;
begin
  if p_ip_key is not null and octet_length(p_ip_key) <> 32 then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;
  select * into v_link from private.rsvp_resolve(p_token_hash, p_now);
  if not found then
    perform private.rsvp_attempts_gc();
    if p_ip_key is not null then
      perform 1 from private.rsvp_hit(p_ip_key, 10, interval '15 minutes', interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false);
  end if;
  v_w := v_link.wedding_id;
  return jsonb_build_object(
    'ok', true,
    'couple', jsonb_build_array(
      (select p.first_name from public.wedding_partners p where p.wedding_id = v_w and p.slot = 'A'),
      (select p.first_name from public.wedding_partners p where p.wedding_id = v_w and p.slot = 'B')),
    'date', (select s.date_from from public.decisions d
             join public.date_scenarios s on s.option_id = d.chosen_option_id and s.wedding_id = d.wedding_id
             where d.wedding_id = v_w and d.key = 'date' and d.status = 'taken'),
    'location', (select jsonb_build_object('name', o.title, 'comune', o.comune) from public.decisions d
                 join public.decision_options o on o.id = d.chosen_option_id and o.wedding_id = d.wedding_id
                 where d.wedding_id = v_w and d.key = 'location' and d.status = 'taken'),
    'theme_id', (select w.theme_id from public.weddings w where w.id = v_w),
    'people', private.rsvp_people_json(v_link.link_id, v_w, p_now));
end;
$$;

-- rsvp_submit(token_hash, ip_key, answers, now)
--   -> { ok:false } | { ok:false, blocked:true, retry_after_seconds } | { ok:true, people, changed_meanwhile }
-- answers = [{id, status, diet, diet_note, seen_at}], 1..100 items, validated as a whole BEFORE anything
-- is written: a bad payload on a working link raises `invalid_answers`. status null = no choice, no write;
-- ids outside the link's CURRENT people are ignored (AC11); a repeated id: the last one wins; "no" clears
-- the preferences. A write happens only if the value changes (the table trigger skips an identical
-- rewrite: answered_at, version and audit stay). changed_meanwhile = written people whose answered_at
-- before the write differed from seen_at (P7). The per-link limit is hit BEFORE the writes, under the
-- row lock of the limiter key, so concurrent submissions on one link run one at a time (QA-9).
create function public.rsvp_submit(p_token_hash bytea, p_ip_key bytea, p_answers jsonb, p_now timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_link record;
  v_hit record;
  v_item jsonb;
  v_ids uuid[];
  v_id uuid;
  v_status text;
  v_diet text[];
  v_note text;
  v_seen timestamptz;
  v_prev timestamptz;
  v_found boolean;
  v_changed uuid[] := '{}';
begin
  if p_ip_key is not null and octet_length(p_ip_key) <> 32 then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;
  select * into v_link from private.rsvp_resolve(p_token_hash, p_now);
  if not found then
    perform private.rsvp_attempts_gc();
    if p_ip_key is not null then
      perform 1 from private.rsvp_hit(p_ip_key, 10, interval '15 minutes', interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false);
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) not between 1 and 100
     or exists (select 1 from jsonb_array_elements(p_answers) e where not private.rsvp_item_ok(e)) then
    raise exception 'invalid_answers' using errcode = 'P0001';
  end if;

  perform private.rsvp_attempts_gc();
  select * into v_hit from private.rsvp_hit(extensions.digest(v_link.link_id::text, 'sha256'), 20, interval '15 minutes', interval '15 minutes');
  if not v_hit.allowed then
    return jsonb_build_object('ok', false, 'blocked', true, 'retry_after_seconds', v_hit.retry_after_seconds);
  end if;

  select coalesce(array_agg(c.guest_id), '{}'::uuid[]) into v_ids from private.rsvp_cover(v_link.wedding_id, v_link.link_id, p_now) c;
  for v_item in
    select e.value from jsonb_array_elements(p_answers) with ordinality e (value, n)
    where e.n = (select max(e2.n) from jsonb_array_elements(p_answers) with ordinality e2 (value, n) where e2.value ->> 'id' = e.value ->> 'id')
    order by e.n
  loop
    v_id := (v_item ->> 'id')::uuid;
    v_status := case when jsonb_typeof(v_item -> 'status') = 'string' then v_item ->> 'status' end;
    if v_status is null or not (v_id = any (v_ids)) then
      continue;
    end if;
    if v_status = 'yes' then
      v_diet := case when jsonb_typeof(v_item -> 'diet') = 'array'
                     then array(select d #>> '{}' from jsonb_array_elements(v_item -> 'diet') d) else '{}'::text[] end;
      v_note := case when jsonb_typeof(v_item -> 'diet_note') = 'string' then v_item ->> 'diet_note' end;
    else
      v_diet := '{}';
      v_note := null;
    end if;
    v_seen := case when jsonb_typeof(v_item -> 'seen_at') = 'string' then (v_item ->> 'seen_at')::timestamptz end;
    select r.answered_at, true into v_prev, v_found from public.rsvp_responses r where r.id = v_id and r.wedding_id = v_link.wedding_id;
    if coalesce(v_found, false) then
      if v_prev is distinct from v_seen then v_changed := v_changed || v_id; end if;
    elsif v_seen is not null then
      v_changed := v_changed || v_id;
    end if;
    v_found := null;
    insert into public.rsvp_responses (id, wedding_id, status, diet, diet_note)
    values (v_id, v_link.wedding_id, v_status, v_diet, v_note)
    on conflict (id) do update set status = excluded.status, diet = excluded.diet, diet_note = excluded.diet_note;
  end loop;

  return jsonb_build_object('ok', true,
    'people', private.rsvp_people_json(v_link.link_id, v_link.wedding_id, p_now),
    'changed_meanwhile', to_jsonb(v_changed));
end;
$$;

-- EXECUTE: nobody but service_role.
revoke all on function
  private.rsvp_hit(bytea, integer, interval, interval),
  private.rsvp_attempts_gc(),
  private.rsvp_resolve(bytea, timestamptz),
  private.rsvp_people_json(uuid, uuid, timestamptz),
  private.rsvp_item_ok(jsonb),
  public.rsvp_gate(bytea, bytea, timestamptz),
  public.rsvp_page(bytea, bytea, timestamptz),
  public.rsvp_submit(bytea, bytea, jsonb, timestamptz)
from public, anon, authenticated;

grant execute on function
  public.rsvp_gate(bytea, bytea, timestamptz),
  public.rsvp_page(bytea, bytea, timestamptz),
  public.rsvp_submit(bytea, bytea, jsonb, timestamptz)
to service_role;
