-- FEAT-2026-004 / T1 - RSVP with a personal link: schema, rules in SQL, couple RPCs (plan "Dati",
-- "Regole in SQL", "RPC per la coppia"; ADR-0002, ADR-0003). Additive: the only `create or replace`
-- is undo_guest_import (same signature). The public RPCs and the limiter are in 20261203200000 (T2).
--
-- Personal data rules (ADR-0002 section 1, ADR-0003):
--   * rsvp_responses.status / diet / diet_note are third-party health-adjacent data: EXCLUDED from the
--     audit (audit_row arguments below). A new column of that table must be classified by its author:
--     rsvp_model.test.sql fails (allowlist) until then.
--   * rsvp_links.token_hash is never selectable (no column grant) and never audited. The token itself
--     is derived by the server (HMAC) and never stored.
--   * `authenticated` can only SELECT these tables. Every write goes through SECURITY DEFINER RPCs
--     (the couple, here) or the public RPCs of T2 (service_role). No anon grant, no anon policy.
--   * Hard delete of a person or group (ADR-0002 section 2) cascades to answers, links and snapshots (BR5, P6).
--   * Conventions of core.sql: business errors P0001 with a stable code, denials 42501.

-- ---------------------------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------------------------

-- Composite FKs from the RSVP tables to a person need this (guest_groups already has it).
alter table public.guests add constraint guests_id_wedding_id_key unique (id, wedding_id);

-- BR1/BR3: "together" (default) = one link answers for the whole group; "separate" = each member is
-- a recipient on their own. Structural, so it is audited. Written with the version + column grant.
alter table public.guest_groups
  add column rsvp_mode text not null default 'together' check (rsvp_mode in ('together', 'separate'));
grant update (rsvp_mode) on public.guest_groups to authenticated;

-- A link points to exactly one target: a group OR a person (no group, deleted group or "separate" group).
-- `id` comes from the server: the token is derived from it (ADR-0003), so there is no default.
create table public.rsvp_links (
  id uuid primary key,
  wedding_id uuid not null references public.weddings (id),
  group_id uuid,
  guest_id uuid,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  revoked_at timestamptz,
  revoked_by uuid,
  shared_at timestamptz,
  shared_by uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check ((group_id is null) <> (guest_id is null)),
  unique (id, wedding_id),
  -- Hard deleting the target deletes the link (BR5, P6); a soft delete keeps it (dormant link, BR4).
  foreign key (group_id, wedding_id) references public.guest_groups (id, wedding_id) on delete cascade,
  foreign key (guest_id, wedding_id) references public.guests (id, wedding_id) on delete cascade
);
create index rsvp_links_wedding_idx on public.rsvp_links (wedding_id);
create index rsvp_links_group_idx on public.rsvp_links (group_id) where group_id is not null;
create index rsvp_links_guest_idx on public.rsvp_links (guest_id) where guest_id is not null;
-- AC7: at most one non-revoked link per target.
create unique index rsvp_links_one_active_group on public.rsvp_links (group_id)
  where group_id is not null and revoked_at is null;
create unique index rsvp_links_one_active_guest on public.rsvp_links (guest_id)
  where guest_id is not null and revoked_at is null;

-- Snapshot of the people a link covered when it was marked "Condiviso" (BR3 "Da rimandare").
-- No personal data (ids only), so no audit.
create table public.rsvp_link_people (
  link_id uuid not null,
  guest_id uuid not null,
  wedding_id uuid not null references public.weddings (id),
  primary key (link_id, guest_id),
  foreign key (link_id, wedding_id) references public.rsvp_links (id, wedding_id) on delete cascade,
  foreign key (guest_id, wedding_id) references public.guests (id, wedding_id) on delete cascade
);
create index rsvp_link_people_guest_idx on public.rsvp_link_people (guest_id);

-- Allowed dietary values, no duplicates (BR11). Used only by the CHECK below.
create function private.rsvp_diet_ok(p_diet text[])
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_diet is not null
    and p_diet <@ array['vegetarian', 'vegan', 'gluten_free', 'lactose_free']::text[]
    and cardinality(p_diet) = (select count(distinct d) from unnest(p_diet) d);
$$;

-- One row per person (P1): no row = "In attesa". id = the guest's id.
create table public.rsvp_responses (
  id uuid primary key,
  wedding_id uuid not null references public.weddings (id),
  status text not null check (status in ('yes', 'no')),
  diet text[] not null default '{}' check (private.rsvp_diet_ok(diet)),
  diet_note text check (diet_note is null or (char_length(btrim(diet_note)) >= 1 and char_length(diet_note) <= 200)),
  -- Set by the trigger from auth.uid(): null (public RPC, secret key) = 'guest'.
  source text not null default 'guest' check (source in ('guest', 'couple')),
  answered_at timestamptz not null default now(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- BR11: preferences only for who says yes; "no" clears them.
  check (status = 'yes' or (diet = '{}' and diet_note is null)),
  foreign key (id, wedding_id) references public.guests (id, wedding_id) on delete cascade
);
create index rsvp_responses_wedding_idx on public.rsvp_responses (wedding_id);

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

-- Insert: stamps source and answered_at. Update: an identical rewrite is NOT written at all (the row,
-- answered_at, version and audit stay as they were: AC11 "doppio invio senza effetti doppi"); a real
-- change stamps source and answered_at (unless the writer set answered_at itself). It runs before
-- bump_version (trigger names fire alphabetically), so a skipped update bumps nothing. An UPDATE that
-- is skipped affects 0 rows: callers must not use the row count as "was written".
create function private.rsvp_responses_stamp()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.source := case when auth.uid() is null then 'guest' else 'couple' end;
    new.answered_at := now();
    return new;
  end if;
  if new.status = old.status and new.diet = old.diet and new.diet_note is not distinct from old.diet_note
     and new.answered_at = old.answered_at then
    return null;
  end if;
  new.source := case when auth.uid() is null then 'guest' else 'couple' end;
  if new.answered_at = old.answered_at then
    new.answered_at := now();
  end if;
  return new;
end;
$$;

create trigger rsvp_responses_a_stamp before insert or update on public.rsvp_responses
  for each row execute function private.rsvp_responses_stamp();
create trigger rsvp_responses_set_audit_cols before insert on public.rsvp_responses
  for each row execute function private.set_audit_cols();
create trigger rsvp_responses_bump_version before update on public.rsvp_responses
  for each row execute function private.bump_version();
create trigger rsvp_responses_guard before update on public.rsvp_responses
  for each row execute function private.guard_row();
-- AC14: answers and preferences never enter the audit log.
create trigger rsvp_responses_audit after insert or update or delete on public.rsvp_responses
  for each row execute function private.audit_row('status', 'diet', 'diet_note');

create trigger rsvp_links_set_audit_cols before insert on public.rsvp_links
  for each row execute function private.set_audit_cols();
create trigger rsvp_links_bump_version before update on public.rsvp_links
  for each row execute function private.bump_version();
create trigger rsvp_links_guard before update on public.rsvp_links
  for each row execute function private.guard_row('group_id', 'guest_id', 'token_hash');
create trigger rsvp_links_audit after insert or update or delete on public.rsvp_links
  for each row execute function private.audit_row('token_hash');

-- ---------------------------------------------------------------------------------------------
-- RLS and grants: SELECT only
-- ---------------------------------------------------------------------------------------------

alter table public.rsvp_links enable row level security;
alter table public.rsvp_link_people enable row level security;
alter table public.rsvp_responses enable row level security;

create policy rsvp_links_select on public.rsvp_links for select to authenticated
  using (public.has_permission(wedding_id, 'guests', 'read'));
create policy rsvp_link_people_select on public.rsvp_link_people for select to authenticated
  using (public.has_permission(wedding_id, 'guests', 'read'));
create policy rsvp_responses_select on public.rsvp_responses for select to authenticated
  using (public.has_permission(wedding_id, 'guests', 'read'));

-- token_hash is deliberately absent from the column list.
grant select (id, wedding_id, group_id, guest_id, revoked_at, revoked_by, shared_at, shared_by,
              version, created_at, created_by, updated_at, updated_by)
  on public.rsvp_links to authenticated;
grant select on public.rsvp_link_people, public.rsvp_responses to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rules in SQL (single source: the public page of T2 and the list read the same functions)
-- ---------------------------------------------------------------------------------------------

-- BR7: the chosen date + 30 days; null while the "date" decision is not taken (BR8: reopened = null).
create function private.rsvp_expires_on(p_wedding uuid)
returns date
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select s.date_from + 30
  from public.decisions d
  join public.date_scenarios s on s.option_id = d.chosen_option_id and s.wedding_id = d.wedding_id
  where d.wedding_id = p_wedding and d.key = 'date' and d.status = 'taken';
$$;

-- The one place that says "expired": the Europe/Rome day of p_now is after date + 30 (BR7, AC12).
-- Used by the rules below and by the couple RPCs (defence in depth: no creation after the expiry).
create function private.rsvp_is_expired(p_wedding uuid, p_now timestamptz default null)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((coalesce(p_now, now()) at time zone 'Europe/Rome')::date > private.rsvp_expires_on(p_wedding), false);
$$;

-- BR1-BR4: which (link, person) pairs work NOW. A link works when it is not revoked, not expired
-- (the Europe/Rome day of p_now is after date + 30) and its target is currently a recipient:
--   * group link: the group is live and "together"; it covers the group's live members;
--   * person link: the person is live and has no live group, or the group is "separate".
-- p_link null = every link of the wedding. A person is covered by at most one link (one group pointer).
create function private.rsvp_cover(p_wedding uuid, p_link uuid default null, p_now timestamptz default null)
returns table (link_id uuid, guest_id uuid)
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
begin
  if private.rsvp_is_expired(p_wedding, p_now) then
    return;
  end if;
  return query
  select l.id, g.id
  from public.rsvp_links l
  join public.guests g on g.wedding_id = l.wedding_id and g.deleted_at is null
  left join public.guest_groups gg on gg.id = g.group_id and gg.wedding_id = g.wedding_id
  where l.wedding_id = p_wedding
    and (p_link is null or l.id = p_link)
    and l.revoked_at is null
    and (
      (l.group_id is not null and g.group_id = l.group_id and gg.deleted_at is null and gg.rsvp_mode = 'together')
      or (l.guest_id is not null and g.id = l.guest_id
          and (gg.id is null or gg.deleted_at is not null or gg.rsvp_mode = 'separate'))
    );
end;
$$;

-- The live people a link covers now (empty = the link does not work). T2 reuses it for the page.
create function private.rsvp_link_people(p_link uuid, p_now timestamptz default null)
returns setof public.guests
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select g.*
  from public.rsvp_links l
  join private.rsvp_cover(l.wedding_id, l.id, p_now) c on c.link_id = l.id
  join public.guests g on g.id = c.guest_id and g.wedding_id = l.wedding_id
  where l.id = p_link
  order by g.created_at, g.id;
$$;

-- Read model of the list: expiry, every link with its "working" flag, and "Da rimandare" people (BR3):
-- live people in the snapshot of a shared link (revoked or not) that no working link covers now.
-- SECURITY DEFINER only to reach the private functions: the wedding is the caller's and `guests/read`
-- is checked first. p_now is for the server clock (e2e); a user can only change what they see.
create function public.rsvp_status(p_now timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_now timestamptz := coalesce(p_now, now());
  v_result jsonb;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  with cover as materialized (select c.link_id, c.guest_id from private.rsvp_cover(v_wedding, null, v_now) c)
  select jsonb_build_object(
    'expires_on', private.rsvp_expires_on(v_wedding),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'group_id', l.group_id, 'guest_id', l.guest_id,
        'working', exists (select 1 from cover c where c.link_id = l.id),
        'revoked_at', l.revoked_at, 'shared_at', l.shared_at, 'created_at', l.created_at)
        order by l.created_at, l.id)
      from public.rsvp_links l where l.wedding_id = v_wedding), '[]'::jsonb),
    'resend_guest_ids', coalesce((
      select jsonb_agg(x.guest_id order by x.guest_id)
      from (
        select distinct p.guest_id
        from public.rsvp_link_people p
        join public.guests g on g.id = p.guest_id and g.wedding_id = p.wedding_id and g.deleted_at is null
        where p.wedding_id = v_wedding
          and not exists (select 1 from cover c where c.guest_id = p.guest_id)
      ) x), '[]'::jsonb))
  into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RPC for the couple (authenticated, guests/write). The wedding is the caller's, never a parameter.
-- ---------------------------------------------------------------------------------------------

-- rsvp_create_links([{link_id, token_hash, group_id | guest_id}]) -> { created: [link_id] }
-- token_hash is the sha256 of the derived token as a bytea literal (`\x...`, 32 bytes). Creates only
-- for CURRENT recipients that have no non-revoked link; every other item is skipped silently. A
-- malformed item refuses the whole call (`invalid_items`); more than 1000 items: `too_many_items`.
create function public.rsvp_create_links(p_items jsonb, p_now timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_created uuid[] := '{}';
  v_item jsonb;
  v_id uuid;
  v_hash bytea;
  v_group uuid;
  v_guest uuid;
  v_new uuid;
  v_ok boolean;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;
  -- AC12 defence in depth: a link created after the expiry would be dead on arrival.
  if private.rsvp_is_expired(v_wedding, p_now) then
    raise exception 'link_expired' using errcode = 'P0001';
  end if;
  begin
    for v_item in select e from jsonb_array_elements(p_items) e loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'invalid_items' using errcode = 'P0001';
      end if;
      v_id := (v_item ->> 'link_id')::uuid;
      v_hash := (v_item ->> 'token_hash')::bytea;
      v_group := (v_item ->> 'group_id')::uuid;
      v_guest := (v_item ->> 'guest_id')::uuid;
      if v_id is null or v_hash is null or octet_length(v_hash) <> 32 or (v_group is null) = (v_guest is null) then
        raise exception 'invalid_items' using errcode = 'P0001';
      end if;
      if v_group is not null then
        select exists (
          select 1 from public.guest_groups gg
          where gg.id = v_group and gg.wedding_id = v_wedding and gg.deleted_at is null and gg.rsvp_mode = 'together'
        ) into v_ok;
      else
        select exists (
          select 1 from public.guests g
          left join public.guest_groups gg on gg.id = g.group_id and gg.wedding_id = g.wedding_id
          where g.id = v_guest and g.wedding_id = v_wedding and g.deleted_at is null
            and (gg.id is null or gg.deleted_at is not null or gg.rsvp_mode = 'separate')
        ) into v_ok;
      end if;
      if not v_ok then
        continue;
      end if;
      v_new := null;
      insert into public.rsvp_links (id, wedding_id, group_id, guest_id, token_hash)
      values (v_id, v_wedding, v_group, v_guest, v_hash)
      on conflict do nothing
      returning id into v_new;
      if v_new is not null then
        v_created := v_created || v_new;
      end if;
    end loop;
  exception when data_exception or integrity_constraint_violation then
    raise exception 'invalid_items' using errcode = 'P0001';
  end;
  return jsonb_build_object('created', to_jsonb(v_created));
end;
$$;

-- rsvp_rotate_link(old id, new id, new hash) -> { link_id }   (AC7, atomic)
-- Revokes the non-revoked link and creates the new one on the same target; the old people snapshot
-- stays with the old link, answers are untouched. The new link starts as "Da condividere".
create function public.rsvp_rotate_link(p_link_id uuid, p_new_id uuid, p_new_hash bytea, p_now timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_old public.rsvp_links;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_old from public.rsvp_links l
  where l.id = p_link_id and l.wedding_id = v_wedding for update;
  if not found or v_old.revoked_at is not null then
    raise exception 'link_not_found' using errcode = 'P0001';
  end if;
  if private.rsvp_is_expired(v_wedding, p_now) then
    raise exception 'link_expired' using errcode = 'P0001';
  end if;
  if p_new_id is null or p_new_hash is null or octet_length(p_new_hash) <> 32 then
    raise exception 'invalid_link' using errcode = 'P0001';
  end if;
  begin
    update public.rsvp_links set revoked_at = now(), revoked_by = auth.uid() where id = v_old.id;
    insert into public.rsvp_links (id, wedding_id, group_id, guest_id, token_hash)
    values (p_new_id, v_wedding, v_old.group_id, v_old.guest_id, p_new_hash);
  exception when data_exception or integrity_constraint_violation then
    raise exception 'invalid_link' using errcode = 'P0001';
  end;
  return jsonb_build_object('link_id', p_new_id);
end;
$$;

-- rsvp_revoke_link(id) -> { link_id }   (AC7) The answers stay; an already revoked link is `link_not_found`.
create function public.rsvp_revoke_link(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_id uuid;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.rsvp_links set revoked_at = now(), revoked_by = auth.uid()
  where id = p_link_id and wedding_id = v_wedding and revoked_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'link_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object('link_id', v_id);
end;
$$;

-- rsvp_mark_shared(id) -> { previous: { shared_at, shared_by, people: [guest id] } }   (AC8, D11)
-- Stamps "Condiviso il" and ADDS the people the link covers now to its snapshot (union: a person
-- stays "da rimandare" until a working link covers them again). `previous` is what Annulla takes back.
-- Only a working link can be marked: `link_not_working` (revoked, expired, dormant or empty).
create function public.rsvp_mark_shared(p_link_id uuid, p_now timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_link public.rsvp_links;
  v_people uuid[];
  v_prev jsonb;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_link from public.rsvp_links l
  where l.id = p_link_id and l.wedding_id = v_wedding for update;
  if not found or v_link.revoked_at is not null then
    raise exception 'link_not_found' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(c.guest_id), '{}'::uuid[]) into v_people
  from private.rsvp_cover(v_wedding, p_link_id, p_now) c;
  if cardinality(v_people) = 0 then
    raise exception 'link_not_working' using errcode = 'P0001';
  end if;
  v_prev := jsonb_build_object(
    'shared_at', v_link.shared_at,
    'shared_by', v_link.shared_by,
    'people', coalesce((select jsonb_agg(p.guest_id order by p.guest_id)
                        from public.rsvp_link_people p where p.link_id = p_link_id), '[]'::jsonb));
  update public.rsvp_links set shared_at = now(), shared_by = auth.uid() where id = p_link_id;
  insert into public.rsvp_link_people (link_id, guest_id, wedding_id)
  select p_link_id, x, v_wedding from unnest(v_people) x
  on conflict do nothing;
  return jsonb_build_object('previous', v_prev);
end;
$$;

-- rsvp_unmark_shared(id, previous) -> { link_id }   (Annulla of "Condiviso il")
-- Puts back shared_at and the exact previous snapshot (people deleted meanwhile are skipped). The
-- attribution (shared_by) is NOT taken from `previous`: it becomes the caller, or null if nothing was shared.
create function public.rsvp_unmark_shared(p_link_id uuid, p_previous jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_people uuid[];
  v_shared_at timestamptz;
  v_shared_by uuid;
  v_id uuid;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_previous is null or jsonb_typeof(p_previous) <> 'object'
     or jsonb_typeof(p_previous -> 'people') is distinct from 'array'
     or jsonb_array_length(p_previous -> 'people') > 1000 then
    raise exception 'invalid_previous' using errcode = 'P0001';
  end if;
  begin
    v_shared_at := nullif(p_previous ->> 'shared_at', '')::timestamptz;
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_people
    from jsonb_array_elements_text(p_previous -> 'people') x;
  exception when data_exception then
    raise exception 'invalid_previous' using errcode = 'P0001';
  end;
  -- Nothing the client sends is trusted for attribution: shared_by is the caller (REV-7/103), and a
  -- "Condiviso il" in the future is refused.
  if v_shared_at > now() then
    raise exception 'invalid_previous' using errcode = 'P0001';
  end if;
  v_shared_by := case when v_shared_at is null then null else auth.uid() end;
  select l.id into v_id from public.rsvp_links l
  where l.id = p_link_id and l.wedding_id = v_wedding for update;
  if v_id is null then
    raise exception 'link_not_found' using errcode = 'P0001';
  end if;
  update public.rsvp_links set shared_at = v_shared_at, shared_by = v_shared_by where id = p_link_id;
  delete from public.rsvp_link_people where link_id = p_link_id;
  insert into public.rsvp_link_people (link_id, guest_id, wedding_id)
  select p_link_id, g.id, v_wedding from public.guests g
  where g.wedding_id = v_wedding and g.id = any (v_people);
  return jsonb_build_object('link_id', p_link_id);
end;
$$;

-- rsvp_link_matches(id, hash) -> boolean
-- Does the stored sha256 of the link equal the one the server recomputed? The couple's client cannot
-- read token_hash (no column grant), so "Copia link" asks here before showing a recomputed URL: a
-- rotated or wrong RSVP_LINK_SECRET gives `false` ("va rigenerato"), never a dead link shown as good.
-- Answers only about a link of the caller's wedding (`link_not_found` otherwise, like the siblings).
create function public.rsvp_link_matches(p_link_id uuid, p_hash bytea)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_stored bytea;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select l.token_hash into v_stored from public.rsvp_links l
  where l.id = p_link_id and l.wedding_id = v_wedding;
  if not found then
    raise exception 'link_not_found' using errcode = 'P0001';
  end if;
  return v_stored = p_hash;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- undo_guest_import: now also leaves the people the RSVP touches (PO-2, narrow rule).
-- ---------------------------------------------------------------------------------------------

-- Same rule as before (untouched since the import: live, version 1, not seated) PLUS: it skips only
-- who has an answer, a NON-revoked personal link, or appears in the snapshot of a shared link. The
-- mere coverage by the group's link does not protect (the group link goes away with the group).
-- Returns also `skipped`: the people that would have been removed but stay because of the RSVP (DES-28).
create or replace function public.undo_guest_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_guests integer := 0;
  v_groups integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'delete') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_batch_id is null then
    return jsonb_build_object('guests', 0, 'groups', 0, 'skipped', 0);
  end if;

  with cand as (
    select g.id,
           (exists (select 1 from public.rsvp_responses r where r.id = g.id)
            or exists (select 1 from public.rsvp_links l where l.guest_id = g.id and l.revoked_at is null)
            or exists (select 1 from public.rsvp_link_people p where p.guest_id = g.id)) as protected
    from public.guests g
    where g.wedding_id = v_wedding and g.import_batch_id = p_batch_id
      and g.version = 1 and g.deleted_at is null and g.table_id is null
  ), del as (
    delete from public.guests g using cand
    where g.id = cand.id and not cand.protected
    returning g.id
  )
  select (select count(*) from del), (select count(*) from cand where cand.protected)
  into v_guests, v_skipped;

  delete from public.guest_groups gg
  where gg.wedding_id = v_wedding and gg.import_batch_id = p_batch_id
    and not exists (select 1 from public.guests m where m.group_id = gg.id and m.wedding_id = gg.wedding_id);
  get diagnostics v_groups = row_count;

  return jsonb_build_object('guests', v_guests, 'groups', v_groups, 'skipped', v_skipped);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- EXECUTE: revoke from everybody first, then grant explicitly.
-- ---------------------------------------------------------------------------------------------

revoke all on function
  private.rsvp_diet_ok(text[]),
  private.rsvp_responses_stamp(),
  private.rsvp_expires_on(uuid),
  private.rsvp_is_expired(uuid, timestamptz),
  private.rsvp_cover(uuid, uuid, timestamptz),
  private.rsvp_link_people(uuid, timestamptz),
  public.rsvp_status(timestamptz),
  public.rsvp_create_links(jsonb, timestamptz),
  public.rsvp_rotate_link(uuid, uuid, bytea, timestamptz),
  public.rsvp_revoke_link(uuid),
  public.rsvp_mark_shared(uuid, timestamptz),
  public.rsvp_unmark_shared(uuid, jsonb),
  public.rsvp_link_matches(uuid, bytea)
from public, anon, authenticated;

-- The CHECK of rsvp_responses.diet runs with the privileges of the writer: a direct write by the secret
-- key (fixtures, support) needs it. API roles never insert (no grant), so nothing is opened to them.
grant execute on function private.rsvp_diet_ok(text[]) to service_role;

grant execute on function
  public.rsvp_status(timestamptz),
  public.rsvp_create_links(jsonb, timestamptz),
  public.rsvp_rotate_link(uuid, uuid, bytea, timestamptz),
  public.rsvp_revoke_link(uuid),
  public.rsvp_mark_shared(uuid, timestamptz),
  public.rsvp_unmark_shared(uuid, jsonb),
  public.rsvp_link_matches(uuid, bytea)
to authenticated;
