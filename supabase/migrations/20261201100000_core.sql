-- FEAT-2026-001 / T2 - DB core and RLS (plan §3, §3.1, §4, §9).
--
-- Identity, wedding space, accounts, audit, heartbeat and the access-code login limiter.
-- Security model (read this before touching anything):
--   * RLS is the ONLY authorization layer. Every table has RLS enabled; `private` is never exposed.
--   * Direct writes of `authenticated` are limited by COLUMN grants (matrix §3.1); everything else
--     goes through SECURITY DEFINER functions that check membership/permission themselves.
--   * Default privileges are REVOKED for anon/authenticated, so later migrations (T8, T9) must
--     GRANT explicitly (tables, columns, functions) and add their functions to the allowlist test.
--     Postgres gives EXECUTE to PUBLIC on every new function: each new function MUST be followed by
--     `revoke all on function ... from public, anon, authenticated` before its explicit grant
--     (core_schema.test.sql fails when anon/authenticated can run something not on the allowlist).
--   * Every SECURITY DEFINER function sets search_path and schema-qualifies every relation.
--   * Business errors raise `P0001` with a stable machine code as message; authorization
--     failures raise `42501` (HTTP 403 through PostgREST).
--   * ONE lock order everywhere (plan §4.8, REV-4): advisory locks -> weddings -> wedding_partners
--     -> invitations -> inserts into memberships/account_events. RPCs that start from an invitation
--     id/token read `wedding_id` WITHOUT a lock (immutable by trigger), lock the wedding, then lock
--     the invitation and re-check its state. Always `for update`, never `for share`.
--   * Account operations (plan §4.8): the DB mutation/authorization runs FIRST with the user's JWT
--     (locks, re-checks, writes the account event, returns the target); the server then calls the
--     Auth admin API ONLY on the returned id.
--   * RUNBOOK: seeds create accounts with a KNOWN access code. They run only on the local stack and
--     in CI. NEVER run `supabase db reset --linked` (it would seed staging/production): migrations
--     reach remote environments through `db push` only, which never runs seeds.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Deny by default: new tables/functions/sequences created by this role are NOT granted to the
-- API roles. service_role keeps the Supabase default (it also bypasses RLS).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema private revoke all on functions from public;

-- ---------------------------------------------------------------------------------------------
-- Generic trigger functions (private, never callable through the API)
-- ---------------------------------------------------------------------------------------------

-- INSERT: stamp created_*/updated_* with the caller (null for service key and seeds).
create function private.set_audit_cols()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();
  new.version := 1;
  return new;
end;
$$;

-- UPDATE: optimistic concurrency token + last editor (plan §9, AC40).
create function private.bump_version()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- UPDATE: `id`, `wedding_id`, `created_*` are immutable; extra columns come from TG_ARGV.
create function private.guard_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_col text;
begin
  foreach v_col in array array['id', 'wedding_id', 'created_at', 'created_by'] || coalesce(tg_argv, '{}'::text[]) loop
    if (v_old -> v_col) is distinct from (v_new -> v_col) then
      raise exception 'immutable_column' using errcode = '23000', detail = v_col;
    end if;
  end loop;
  return new;
end;
$$;

-- Append-only tables: no UPDATE/DELETE/TRUNCATE for anybody, secret key included.
create function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'append_only' using errcode = '23000';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  rite text check (rite in ('civile', 'religioso', 'simbolico', 'unknown')),
  guest_band text check (guest_band in ('up_to_50', '50_80', '80_120', 'over_120', 'unknown')),
  style_label text check (char_length(style_label) <= 60),
  style_note text check (char_length(style_note) <= 500),
  region text check (char_length(region) <= 80),
  comune text check (char_length(comune) <= 80),
  theme_id text not null default 'giardino' check (theme_id ~ '^[a-z0-9-]{1,40}$'),
  onboarding_answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(onboarding_answers) = 'object' and octet_length(onboarding_answers::text) <= 20000),
  -- at most 20 entries and 2000 bytes in total (REV-7: elements are otherwise unbounded text)
  onboarding_unknown text[] not null default '{}'
    check (cardinality(onboarding_unknown) <= 20 and octet_length(onboarding_unknown::text) <= 2000),
  onboarding_completed_at timestamptz,
  -- FK to decision_options is added by T8 (composite, deferred creation of that table).
  manual_reference_option_id uuid,
  applied_reference_date date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
-- One wedding per founder in R1 (BR1, BR13). Race-proof twin of the check in create_wedding.
create unique index weddings_one_per_creator on public.weddings (created_by) where created_by is not null;

create table public.wedding_partners (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  slot text not null check (slot in ('A', 'B')),
  label text check (char_length(label) <= 40),
  first_name text check (char_length(first_name) <= 80),
  last_name text check (char_length(last_name) <= 80),
  email extensions.citext not null
    check (char_length(email::text) <= 254 and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  user_id uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (wedding_id, slot),
  unique (wedding_id, email),
  unique (id, wedding_id)
);
create unique index wedding_partners_user_per_wedding on public.wedding_partners (wedding_id, user_id)
  where user_id is not null;

create table public.memberships (
  wedding_id uuid not null references public.weddings (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('partner', 'family', 'planner')),
  partner_slot text check (partner_slot in ('A', 'B')),
  created_at timestamptz not null default now(),
  primary key (wedding_id, user_id),
  -- max 2 partners per wedding, enforced by the database (BR12, AC6)
  unique (wedding_id, partner_slot),
  check ((role = 'partner') = (partner_slot is not null))
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  slot text not null default 'B' check (slot = 'B'),
  email extensions.citext not null
    check (char_length(email::text) <= 254 and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  method text not null check (method in ('code', 'email')),
  invitee_user_id uuid references auth.users (id) on delete set null,
  token_hash bytea check (octet_length(token_hash) = 32),
  expires_at timestamptz,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid,
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- token and expiry exist only for the email method (§3)
  check ((method = 'email') = (token_hash is not null)),
  check ((method = 'email') = (expires_at is not null)),
  check (accepted_at is null or revoked_at is null),
  unique (id, wedding_id)
);
-- A single pending invitation per wedding.
create unique index invitations_one_pending on public.invitations (wedding_id)
  where accepted_at is null and revoked_at is null;
create index invitations_token_hash_idx on public.invitations (token_hash) where token_hash is not null;

create table public.account_events (
  id bigint generated always as identity primary key,
  wedding_id uuid not null references public.weddings (id),
  kind text not null check (kind in (
    'partner_account_created', 'temp_code_set', 'code_changed', 'email_changed', 'invite_revoked'
  )),
  -- No FK to auth.users on purpose: the table is append-only and accounts can be deleted.
  actor_id uuid not null,
  target_user_id uuid,
  at timestamptz not null default now()
);
create index account_events_wedding_idx on public.account_events (wedding_id, at desc);

create table public.user_wedding_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  wedding_id uuid not null references public.weddings (id),
  last_seen_at timestamptz,
  previous_seen_at timestamptz,
  last_export_at timestamptz,
  welcome_dismissed_at timestamptz,
  primary key (user_id, wedding_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  table_name text not null,
  row_id text,
  wedding_id uuid,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_wedding_idx on public.audit_log (wedding_id, at desc);

create table public.heartbeats (
  id bigint generated always as identity primary key,
  source text not null check (char_length(source) between 1 and 50),
  ran_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4000)
);
create index heartbeats_source_idx on public.heartbeats (source, ran_at desc);

create table private.role_permissions (
  role text not null check (role in ('partner', 'family', 'planner')),
  area text not null check (area ~ '^[a-z_]{1,40}$'),
  action text not null check (action in ('read', 'write')),
  primary key (role, area, action)
);

create table private.login_attempts (
  key_hash bytea primary key check (octet_length(key_hash) = 32),
  failed_count integer not null default 0 check (failed_count >= 0),
  window_start timestamptz not null default now(),
  locked_until timestamptz
);
create index login_attempts_window_idx on private.login_attempts (window_start);

-- Roles -> permissions. Only `partner` has rows in R1; `family` and `planner` exist as roles with
-- no rows (no UI assigns them), so they read and write nothing until rows are added.
insert into private.role_permissions (role, area, action)
select 'partner', a.area, x.action
from (values
  ('wedding'), ('partners'), ('invitations'), ('audit'),
  ('decisions'), ('tasks'), ('budget'), ('notifications')
) as a (area)
cross join (values ('read'), ('write')) as x (action);

-- ---------------------------------------------------------------------------------------------
-- Row-level triggers
-- ---------------------------------------------------------------------------------------------

create trigger weddings_set_audit_cols before insert on public.weddings
  for each row execute function private.set_audit_cols();
create trigger weddings_bump_version before update on public.weddings
  for each row execute function private.bump_version();
create trigger weddings_guard before update on public.weddings
  for each row execute function private.guard_row();

create trigger wedding_partners_set_audit_cols before insert on public.wedding_partners
  for each row execute function private.set_audit_cols();
create trigger wedding_partners_bump_version before update on public.wedding_partners
  for each row execute function private.bump_version();
create trigger wedding_partners_guard before update on public.wedding_partners
  for each row execute function private.guard_row('slot');

create trigger invitations_set_audit_cols before insert on public.invitations
  for each row execute function private.set_audit_cols();
create trigger invitations_bump_version before update on public.invitations
  for each row execute function private.bump_version();
create trigger invitations_guard before update on public.invitations
  for each row execute function private.guard_row('slot', 'method');

create trigger memberships_guard before update on public.memberships
  for each row execute function private.guard_row('user_id');

-- Append-only: audit_log, account_events (no UPDATE/DELETE/TRUNCATE, not even the secret key).
create trigger audit_log_forbid_mutation before update or delete on public.audit_log
  for each row execute function private.forbid_mutation();
create trigger audit_log_forbid_truncate before truncate on public.audit_log
  for each statement execute function private.forbid_mutation();
create trigger account_events_forbid_mutation before update or delete on public.account_events
  for each row execute function private.forbid_mutation();
create trigger account_events_forbid_truncate before truncate on public.account_events
  for each statement execute function private.forbid_mutation();

-- Audit: who/when/before/after for every change to domain data (BR14). Columns listed in
-- TG_ARGV are never copied (invitations.token_hash is a secret-equivalent).
create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_ref jsonb;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - coalesce(tg_argv, '{}'::text[]) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - coalesce(tg_argv, '{}'::text[]) end;
  v_ref := coalesce(v_new, v_old);
  insert into public.audit_log (actor_id, table_name, row_id, wedding_id, op, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(v_ref ->> 'id', v_ref ->> 'user_id'),
    case
      when tg_table_name = 'weddings' then (v_ref ->> 'id')::uuid
      else (v_ref ->> 'wedding_id')::uuid
    end,
    tg_op,
    v_old,
    v_new
  );
  return null;
end;
$$;

create trigger weddings_audit after insert or update or delete on public.weddings
  for each row execute function private.audit_row();
create trigger wedding_partners_audit after insert or update or delete on public.wedding_partners
  for each row execute function private.audit_row();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.audit_row();
create trigger invitations_audit after insert or update or delete on public.invitations
  for each row execute function private.audit_row('token_hash');

-- ---------------------------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------------------------

-- has_permission(wedding, area, action): the single predicate used by every RLS policy.
-- SECURITY DEFINER so that policies on `memberships` itself cannot recurse.
create function public.has_permission(p_wedding_id uuid, p_area text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.memberships m
    join private.role_permissions rp on rp.role = m.role
    where m.wedding_id = p_wedding_id
      and m.user_id = (select auth.uid())
      and rp.area = p_area
      and rp.action = p_action
  );
$$;

-- The wedding of the caller (R1: one per user; oldest membership wins if ever more).
create function private.current_wedding_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select m.wedding_id
  from public.memberships m
  where m.user_id = (select auth.uid())
  order by m.created_at, m.wedding_id
  limit 1;
$$;

-- Account email from Auth (source of truth: the JWT can be stale after an email change).
create function private.account_email(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select lower(btrim(u.email)) from auth.users u where u.id = p_user_id;
$$;

-- Normalizes and validates an email; raises `invalid_email`.
create function private.norm_email(p_email text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(v) > 254 or v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- The ONE predicate that says whether an existing Auth account may receive a code, change email or
-- be deleted by someone who is not its owner (plan §4.8, REV-1). True only if the account exists,
-- is not deleted, has NEVER signed in, has no membership anywhere, is not a founder and has no
-- pending invitation of ANOTHER wedding (by id or email).
create function private.account_reusable(p_user_id uuid, p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and u.deleted_at is null
      and u.last_sign_in_at is null
      and coalesce(u.raw_app_meta_data ->> 'r2y_founder', '') <> 'true'
      and not exists (select 1 from public.memberships m where m.user_id = u.id)
      and not exists (
        select 1 from public.invitations i
        where i.wedding_id <> p_wedding_id and i.accepted_at is null and i.revoked_at is null
          and (i.invitee_user_id = u.id or i.email::text = lower(btrim(u.email)))
      )
  );
$$;

-- Account events (append-only trail shown in "Novita", never the code). NOT callable through the
-- API (REV-3): only the RPCs that authorize an account operation write them, in the same
-- transaction, with the actor taken from auth.uid() and kind/target derived from the operation.
create function private.record_account_event(p_wedding_id uuid, p_kind text, p_target_user_id uuid)
returns bigint
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  insert into public.account_events (wedding_id, kind, actor_id, target_user_id)
  values (p_wedding_id, p_kind, (select auth.uid()), p_target_user_id)
  returning id;
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS and grants (matrix §3.1)
-- ---------------------------------------------------------------------------------------------

alter table public.weddings enable row level security;
alter table public.wedding_partners enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.account_events enable row level security;
alter table public.user_wedding_state enable row level security;
alter table public.audit_log enable row level security;
alter table public.heartbeats enable row level security;
alter table private.role_permissions enable row level security;
alter table private.login_attempts enable row level security;

create policy weddings_select on public.weddings for select to authenticated
  using (public.has_permission(id, 'wedding', 'read'));
create policy weddings_update on public.weddings for update to authenticated
  using (public.has_permission(id, 'wedding', 'write'))
  with check (public.has_permission(id, 'wedding', 'write'));

create policy wedding_partners_select on public.wedding_partners for select to authenticated
  using (public.has_permission(wedding_id, 'partners', 'read'));
create policy wedding_partners_update on public.wedding_partners for update to authenticated
  using (public.has_permission(wedding_id, 'partners', 'write'))
  with check (public.has_permission(wedding_id, 'partners', 'write'));

create policy memberships_select on public.memberships for select to authenticated
  using (public.has_permission(wedding_id, 'partners', 'read'));

create policy invitations_select on public.invitations for select to authenticated
  using (public.has_permission(wedding_id, 'invitations', 'read'));

create policy account_events_select on public.account_events for select to authenticated
  using (public.has_permission(wedding_id, 'partners', 'read'));

create policy user_wedding_state_select on public.user_wedding_state for select to authenticated
  using (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'wedding', 'read'));

create policy audit_log_select on public.audit_log for select to authenticated
  using (wedding_id is not null and public.has_permission(wedding_id, 'audit', 'read'));

-- heartbeats and the private tables: RLS on, no policy, no grant.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

grant select on public.weddings, public.wedding_partners, public.memberships,
  public.account_events, public.user_wedding_state, public.audit_log to authenticated;
grant update (rite, guest_band, style_label, style_note, region, comune, theme_id,
  onboarding_answers, onboarding_unknown) on public.weddings to authenticated;
grant update (label, first_name, last_name) on public.wedding_partners to authenticated;
-- invitations: SELECT without token_hash (a `select *` through the API is refused on purpose).
grant select (id, wedding_id, slot, email, method, invitee_user_id, expires_at, revoked_at,
  accepted_at, accepted_by, last_sent_at, send_count, version, created_at, created_by,
  updated_at, updated_by) on public.invitations to authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- RPC: founder, wedding, partners
-- ---------------------------------------------------------------------------------------------

-- create_wedding(): only the bootstrap founder (app_metadata.r2y_founder = true), once, and never
-- someone with a pending invitation (BR13). Creates wedding, partner A and A's membership.
create function public.create_wedding()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
  v_wedding uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'r2y_founder', '') <> 'true' then
    raise exception 'not_founder' using errcode = '42501';
  end if;

  -- Serializes concurrent calls of the same user (double click, retries).
  perform pg_advisory_xact_lock(hashtextextended('create_wedding:' || v_uid::text, 0));

  if exists (select 1 from public.memberships m where m.user_id = v_uid) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.weddings w where w.created_by = v_uid) then
    raise exception 'already_created' using errcode = 'P0001';
  end if;

  v_email := private.account_email(v_uid);
  if v_email is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.invitations i
    where i.email::text = v_email and i.accepted_at is null and i.revoked_at is null
  ) then
    raise exception 'pending_invitation' using errcode = 'P0001';
  end if;

  v_role := auth.jwt() -> 'app_metadata' ->> 'r2y_role';
  if v_role not in ('sposo', 'sposa') then
    v_role := null;
  end if;

  insert into public.weddings default values returning id into v_wedding;
  insert into public.wedding_partners (wedding_id, slot, label, email, user_id)
  values (v_wedding, 'A', v_role, v_email, v_uid);
  insert into public.memberships (wedding_id, user_id, role, partner_slot)
  values (v_wedding, v_uid, 'partner', 'A');
  return v_wedding;
end;
$$;

-- upsert_partner_b(): creates partner B (optional row) or edits its names/label. The EMAIL of an
-- existing B can only change through update_partner_email (it must stay in sync with Auth).
create function public.upsert_partner_b(
  p_email text, p_first_name text default null, p_last_name text default null, p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_email text;
  v_existing public.wedding_partners%rowtype;
  v_a_email text;
  v_id uuid;
begin
  if v_wedding is null or not public.has_permission(v_wedding, 'partners', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_email := private.norm_email(p_email);

  perform 1 from public.weddings w where w.id = v_wedding for update;

  select wp.email::text into v_a_email
  from public.wedding_partners wp where wp.wedding_id = v_wedding and wp.slot = 'A';
  if v_a_email = v_email then
    raise exception 'same_email' using errcode = 'P0001';
  end if;

  select * into v_existing from public.wedding_partners wp
  where wp.wedding_id = v_wedding and wp.slot = 'B' for update;

  if found then
    if v_existing.email::text <> v_email then
      raise exception 'email_change_not_allowed' using errcode = 'P0001';
    end if;
    update public.wedding_partners
    set first_name = p_first_name, last_name = p_last_name, label = p_label
    where id = v_existing.id;
    return v_existing.id;
  end if;

  insert into public.wedding_partners (wedding_id, slot, label, first_name, last_name, email)
  values (v_wedding, 'B', p_label, p_first_name, p_last_name, v_email)
  returning id into v_id;
  return v_id;
end;
$$;

-- update_partner_email(slot, email) -> { target_user_id, old_email }
-- Only partner B, only while B has never entered. Updates the partner row and the pending
-- invitation, writes the `email_changed` event and returns the bound account to update through the
-- Auth admin API (only if that account is still reusable). Compensation after an admin failure =
-- call again with `old_email` (idempotent).
create function public.update_partner_email(p_slot text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_email text;
  v_partner public.wedding_partners%rowtype;
  v_inv public.invitations%rowtype;
  v_bound uuid;
  v_old text;
begin
  if v_wedding is null or not public.has_permission(v_wedding, 'partners', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_slot is distinct from 'B' then
    raise exception 'invalid_slot' using errcode = 'P0001';
  end if;
  v_email := private.norm_email(p_email);

  perform 1 from public.weddings w where w.id = v_wedding for update;

  select * into v_partner from public.wedding_partners wp
  where wp.wedding_id = v_wedding and wp.slot = 'B' for update;
  if not found then
    raise exception 'no_pending_partner' using errcode = 'P0001';
  end if;
  if v_partner.user_id is not null
     or exists (select 1 from public.memberships m where m.wedding_id = v_wedding and m.partner_slot = 'B') then
    raise exception 'partner_already_joined' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.wedding_partners wp
    where wp.wedding_id = v_wedding and wp.slot = 'A' and wp.email::text = v_email
  ) then
    raise exception 'same_email' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invitations i
  where i.wedding_id = v_wedding and i.accepted_at is null and i.revoked_at is null for update;
  v_bound := v_inv.invitee_user_id;
  v_old := v_partner.email::text;

  -- The bound account must still be reusable (never signed in, not a member, ...).
  if v_bound is not null and not private.account_reusable(v_bound, v_wedding) then
    raise exception 'partner_already_joined' using errcode = 'P0001';
  end if;
  -- A different Auth account already owns the new address.
  if exists (
    select 1 from auth.users u
    where lower(btrim(u.email)) = v_email and u.id is distinct from v_bound
  ) then
    raise exception 'email_in_use' using errcode = 'P0001';
  end if;

  if v_old <> v_email then
    update public.wedding_partners set email = v_email where id = v_partner.id;
    update public.invitations set email = v_email where id = v_inv.id;
    perform private.record_account_event(v_wedding, 'email_changed', v_bound);
  end if;
  return jsonb_build_object('target_user_id', v_bound, 'old_email', v_old);
end;
$$;

-- sync_my_email(): copies the Auth email into the caller's own partner row (after a change).
create function public.sync_my_email()
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_wedding uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  v_email := private.account_email(v_uid);
  if v_email is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select wp.wedding_id into v_wedding from public.wedding_partners wp where wp.user_id = v_uid limit 1;
  if v_wedding is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.weddings w where w.id = v_wedding for update;
  begin
    update public.wedding_partners set email = v_email
    where user_id = v_uid and email::text <> v_email;
  exception when unique_violation then
    raise exception 'email_in_use' using errcode = 'P0001';
  end;
  return v_email;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RPC: invitations
-- ---------------------------------------------------------------------------------------------

-- create_invitation(email, method, invitee_user_id, token_hash) -> { id, method, expires_at, invitee_user_id }
-- Invitation for partner B. This is step 1 of "create B" (plan §4.8): the DB decides first.
--   method 'code'  : the Auth account is created/updated by the server AFTER this call.
--   method 'email' : token_hash = sha256 of the one-time token (32 random bytes made by the server).
-- If an Auth account already exists for the email it must be REUSABLE (never signed in, no
-- membership, not a founder, no pending invitation elsewhere) or the call fails with `email_in_use`;
-- its id comes back as `invitee_user_id` and is the ONLY id the server may touch.
-- Same email + same method while pending = re-delivery (send_count + 1, event written again).
-- Passing `p_invitee_user_id` for a pending invitation that has no account yet BINDS the account the
-- server has just created (no new delivery, no new event). The id must own the invitation email.
create function public.create_invitation(
  p_email text, p_method text, p_invitee_user_id uuid default null, p_token_hash bytea default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_email text;
  v_pending public.invitations%rowtype;
  v_partner_email text;
  v_user uuid;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_wedding is null or not public.has_permission(v_wedding, 'invitations', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_email := private.norm_email(p_email);
  if p_method not in ('code', 'email') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  if (p_method = 'email') <> (p_token_hash is not null)
     or (p_token_hash is not null and octet_length(p_token_hash) <> 32) then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  perform 1 from public.weddings w where w.id = v_wedding for update;

  if exists (select 1 from public.memberships m where m.wedding_id = v_wedding and m.partner_slot = 'B') then
    raise exception 'partner_already_joined' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.wedding_partners wp
    where wp.wedding_id = v_wedding and wp.slot = 'A' and wp.email::text = v_email
  ) then
    raise exception 'same_email' using errcode = 'P0001';
  end if;
  select wp.email::text into v_partner_email
  from public.wedding_partners wp where wp.wedding_id = v_wedding and wp.slot = 'B' for update;
  if v_partner_email is not null and v_partner_email <> v_email then
    raise exception 'partner_email_mismatch' using errcode = 'P0001';
  end if;

  select u.id into v_user from auth.users u
  where lower(btrim(u.email)) = v_email and u.deleted_at is null limit 1;
  if v_user is not null and not private.account_reusable(v_user, v_wedding) then
    raise exception 'email_in_use' using errcode = 'P0001';
  end if;
  if p_invitee_user_id is not null and p_invitee_user_id is distinct from v_user then
    raise exception 'invitee_mismatch' using errcode = 'P0001';
  end if;

  select * into v_pending from public.invitations i
  where i.wedding_id = v_wedding and i.accepted_at is null and i.revoked_at is null for update;
  if found then
    if v_pending.method = 'email' and v_pending.expires_at < now() then
      update public.invitations set revoked_at = now() where id = v_pending.id;
    elsif v_pending.email::text = v_email and v_pending.method = p_method then
      if p_invitee_user_id is not null and v_pending.invitee_user_id is null then
        update public.invitations set invitee_user_id = p_invitee_user_id where id = v_pending.id;
        return jsonb_build_object('id', v_pending.id, 'method', p_method,
          'expires_at', v_pending.expires_at, 'invitee_user_id', p_invitee_user_id);
      end if;
      v_expires := case when p_method = 'email' then now() + interval '7 days' end;
      update public.invitations
      set invitee_user_id = v_user,
          token_hash = case when p_method = 'email' then p_token_hash end,
          expires_at = v_expires,
          last_sent_at = now(),
          send_count = send_count + 1
      where id = v_pending.id;
      perform private.record_account_event(v_wedding, 'partner_account_created', v_user);
      return jsonb_build_object('id', v_pending.id, 'method', p_method,
        'expires_at', v_expires, 'invitee_user_id', v_user);
    else
      raise exception 'invitation_pending' using errcode = 'P0001';
    end if;
  end if;

  v_expires := case when p_method = 'email' then now() + interval '7 days' end;
  insert into public.invitations (wedding_id, email, method, invitee_user_id, token_hash, expires_at, last_sent_at, send_count)
  values (v_wedding, v_email, p_method, v_user, p_token_hash, v_expires, now(), 1)
  returning id into v_id;
  perform private.record_account_event(v_wedding, 'partner_account_created', v_user);
  return jsonb_build_object('id', v_id, 'method', p_method, 'expires_at', v_expires, 'invitee_user_id', v_user);
end;
$$;

-- rotate_invitation(id, token_hash): "send again" for an email invitation; the old token stops working.
-- Lock order: wedding first (wedding_id is immutable, read without lock), then the invitation, re-checked.
create function public.rotate_invitation(p_invitation_id uuid, p_token_hash bytea)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid;
  v_inv public.invitations%rowtype;
  v_expires timestamptz := now() + interval '7 days';
begin
  select i.wedding_id into v_wedding from public.invitations i where i.id = p_invitation_id;
  if v_wedding is null or not public.has_permission(v_wedding, 'invitations', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.weddings w where w.id = v_wedding for update;
  select * into v_inv from public.invitations i where i.id = p_invitation_id for update;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_inv.method <> 'email' then
    raise exception 'wrong_method' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  update public.invitations
  set token_hash = p_token_hash, expires_at = v_expires, last_sent_at = now(), send_count = send_count + 1
  where id = v_inv.id;
  return jsonb_build_object('id', v_inv.id, 'expires_at', v_expires);
end;
$$;

-- revoke_invitation(id) -> { delete_user_id }
-- Idempotent while not accepted (`already_accepted` otherwise). Writes `invite_revoked` the first
-- time. `delete_user_id` is the account bound to the invitation ONLY while it is still reusable
-- (never signed in, no membership, ...): it is the only id the server may delete. Repeating the
-- call returns it again until the account is gone.
create function public.revoke_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid;
  v_inv public.invitations%rowtype;
  v_delete uuid;
begin
  select i.wedding_id into v_wedding from public.invitations i where i.id = p_invitation_id;
  if v_wedding is null or not public.has_permission(v_wedding, 'invitations', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.weddings w where w.id = v_wedding for update;
  select * into v_inv from public.invitations i where i.id = p_invitation_id for update;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'already_accepted' using errcode = 'P0001';
  end if;
  if v_inv.revoked_at is null then
    update public.invitations set revoked_at = now() where id = v_inv.id;
    perform private.record_account_event(v_wedding, 'invite_revoked', v_inv.invitee_user_id);
  end if;
  if v_inv.invitee_user_id is not null and private.account_reusable(v_inv.invitee_user_id, v_wedding) then
    v_delete := v_inv.invitee_user_id;
  end if;
  return jsonb_build_object('delete_user_id', v_delete);
end;
$$;

-- accept_pending_invitation(): called at B's first access. Outcome codes:
--   ok | already_member | not_found | revoked | expired | full
-- Lock order (REV-4): advisory -> wedding -> partner row -> invitation, same as every other RPC.
-- The wedding of the candidate invitation is read without a lock, then everything is re-checked.
create function public.accept_pending_invitation()
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_wedding uuid;
  v_inv public.invitations%rowtype;
  v_slot_taken boolean;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('accept:' || v_uid::text, 0));

  if exists (select 1 from public.memberships m where m.user_id = v_uid) then
    return 'already_member';
  end if;
  v_email := private.account_email(v_uid);
  if v_email is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select i.wedding_id into v_wedding from public.invitations i
  where i.email::text = v_email and i.slot = 'B' and i.accepted_at is null and i.revoked_at is null
    and (i.invitee_user_id is null or i.invitee_user_id = v_uid)
  order by i.created_at desc limit 1;
  if v_wedding is null then
    if exists (
      select 1 from public.invitations i
      where i.email::text = v_email and i.revoked_at is not null
        and (i.invitee_user_id is null or i.invitee_user_id = v_uid)
    ) then
      return 'revoked';
    end if;
    return 'not_found';
  end if;

  perform 1 from public.weddings w where w.id = v_wedding for update;
  perform 1 from public.wedding_partners wp where wp.wedding_id = v_wedding and wp.slot = 'B' for update;

  -- Re-check after the locks: it may have been revoked, accepted, or its email changed meanwhile.
  select * into v_inv from public.invitations i
  where i.wedding_id = v_wedding and i.email::text = v_email and i.slot = 'B'
    and i.accepted_at is null and i.revoked_at is null
    and (i.invitee_user_id is null or i.invitee_user_id = v_uid)
  order by i.created_at desc limit 1
  for update;
  if not found then
    if exists (
      select 1 from public.invitations i
      where i.wedding_id = v_wedding and i.email::text = v_email and i.revoked_at is not null
        and (i.invitee_user_id is null or i.invitee_user_id = v_uid)
    ) then
      return 'revoked';
    end if;
    return 'not_found';
  end if;
  if v_inv.method = 'email' and v_inv.expires_at < now() then
    return 'expired';
  end if;

  select exists (
    select 1 from public.memberships m where m.wedding_id = v_wedding and m.partner_slot = 'B'
  ) or (
    select count(*) from public.memberships m where m.wedding_id = v_wedding and m.role = 'partner'
  ) >= 2 into v_slot_taken;
  if v_slot_taken then
    return 'full';
  end if;

  insert into public.memberships (wedding_id, user_id, role, partner_slot)
  values (v_wedding, v_uid, 'partner', 'B');

  update public.wedding_partners set user_id = v_uid
  where wedding_id = v_wedding and slot = 'B' and email::text = v_email;
  if not found then
    insert into public.wedding_partners (wedding_id, slot, email, user_id)
    values (v_wedding, 'B', v_email, v_uid);
  end if;

  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  return 'ok';
end;
$$;

-- invitation_by_token(token_hash) -> { ok, invitation_id, user_id }   (SECRET KEY ONLY)
-- Used by the one-time link `/invito/[token]` (no session). Neutral answer `{ ok: false }` for an
-- unknown, used, revoked or expired token, an invitation without account, or an account that is no
-- longer reusable. On success `user_id` is the only account the server may set a password on.
create function public.invitation_by_token(p_token_hash bytea)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
  v_wedding uuid;
  v_inv public.invitations%rowtype;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    return jsonb_build_object('ok', false);
  end if;
  select i.id, i.wedding_id into v_id, v_wedding from public.invitations i
  where i.token_hash = p_token_hash and i.method = 'email' limit 1;
  if v_id is null then
    return jsonb_build_object('ok', false);
  end if;
  perform 1 from public.weddings w where w.id = v_wedding for update;
  select * into v_inv from public.invitations i
  where i.id = v_id and i.token_hash = p_token_hash and i.accepted_at is null and i.revoked_at is null
    and i.expires_at > now()
  for update;
  if not found or v_inv.invitee_user_id is null
     or not private.account_reusable(v_inv.invitee_user_id, v_wedding) then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'invitation_id', v_inv.id, 'user_id', v_inv.invitee_user_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RPC: account operations that change no DB row (the DB decides AND records, the server executes)
-- ---------------------------------------------------------------------------------------------

-- authorize_account_op(op, target_slot, new_email) -> { allowed, wedding_id, target_user_id,
--   target_email [, new_email] } or { allowed:false, error }.   VOLATILE: it writes the event.
-- Ops (REV-3: kind and target are derived here, never declared by the caller):
--   set_temp_code    target = the OTHER member, or the pending invitee if still reusable;
--                    event temp_code_set
--   change_own_code  target = caller; event code_changed
--   change_own_email target = caller; `email_in_use` if the new address has an Auth account or is
--                    the other partner's; event email_changed
-- create_partner / update_pending_email / delete_pending are NOT here any more: create_invitation,
-- update_partner_email and revoke_invitation are their step 1.
-- The event is written BEFORE the admin call (a spare warning is safe, a missing one is not).
create function public.authorize_account_op(
  p_op text, p_target_slot text default null, p_new_email text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_wedding uuid;
  v_slot text;
  v_other text;
  v_target_user uuid;
  v_target_email text;
  v_inv public.invitations%rowtype;
  v_new text;
  v_current text;
begin
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'error', 'unauthenticated');
  end if;
  select m.wedding_id into v_wedding
  from public.memberships m
  where m.user_id = v_uid and m.role = 'partner'
  order by m.created_at, m.wedding_id limit 1;
  if v_wedding is null then
    return jsonb_build_object('allowed', false, 'error', 'not_partner');
  end if;

  perform 1 from public.weddings w where w.id = v_wedding for update;
  select m.partner_slot into v_slot from public.memberships m
  where m.wedding_id = v_wedding and m.user_id = v_uid and m.role = 'partner';
  if v_slot is null or not public.has_permission(v_wedding, 'partners', 'write') then
    return jsonb_build_object('allowed', false, 'error', 'not_partner');
  end if;

  if p_op = 'change_own_code' then
    perform private.record_account_event(v_wedding, 'code_changed', v_uid);
    return jsonb_build_object('allowed', true, 'wedding_id', v_wedding,
      'target_user_id', v_uid, 'target_email', private.account_email(v_uid));

  elsif p_op = 'change_own_email' then
    v_new := private.norm_email(p_new_email);
    v_current := private.account_email(v_uid);
    if v_new = v_current then
      return jsonb_build_object('allowed', false, 'error', 'same_email');
    end if;
    if exists (select 1 from auth.users u where lower(btrim(u.email)) = v_new and u.id <> v_uid)
       or exists (
         select 1 from public.wedding_partners wp
         where wp.wedding_id = v_wedding and wp.email::text = v_new and wp.user_id is distinct from v_uid
       ) then
      return jsonb_build_object('allowed', false, 'error', 'email_in_use');
    end if;
    perform private.record_account_event(v_wedding, 'email_changed', v_uid);
    return jsonb_build_object('allowed', true, 'wedding_id', v_wedding,
      'target_user_id', v_uid, 'target_email', v_current, 'new_email', v_new);

  elsif p_op = 'set_temp_code' then
    v_other := case v_slot when 'A' then 'B' else 'A' end;
    if p_target_slot is not null and p_target_slot <> v_other then
      return jsonb_build_object('allowed', false, 'error', 'self_target');
    end if;
    select m.user_id into v_target_user from public.memberships m
    where m.wedding_id = v_wedding and m.partner_slot = v_other and m.role = 'partner';
    if v_target_user is not null then
      v_target_email := private.account_email(v_target_user);
    else
      -- The other partner has not entered yet: only the invited account, and only if reusable.
      select * into v_inv from public.invitations i
      where i.wedding_id = v_wedding and i.accepted_at is null and i.revoked_at is null for update;
      if found and v_inv.invitee_user_id is not null
         and private.account_reusable(v_inv.invitee_user_id, v_wedding) then
        v_target_user := v_inv.invitee_user_id;
        v_target_email := v_inv.email::text;
      end if;
    end if;
    if v_target_user is null then
      return jsonb_build_object('allowed', false, 'error', 'no_account');
    end if;
    perform private.record_account_event(v_wedding, 'temp_code_set', v_target_user);
    return jsonb_build_object('allowed', true, 'wedding_id', v_wedding,
      'target_user_id', v_target_user, 'target_email', v_target_email);
  end if;

  return jsonb_build_object('allowed', false, 'error', 'unknown_op');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RPC: per-user state, heartbeat
-- ---------------------------------------------------------------------------------------------

-- The three state RPCs share one upsert; each updates only its own columns.
create function private.touch_state(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_wedding uuid := private.current_wedding_id();
  v_row public.user_wedding_state%rowtype;
begin
  if v_uid is null or v_wedding is null or not public.has_permission(v_wedding, 'wedding', 'read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.user_wedding_state (user_id, wedding_id) values (v_uid, v_wedding)
  on conflict (user_id, wedding_id) do nothing;

  if p_kind = 'seen' then
    update public.user_wedding_state
    set previous_seen_at = last_seen_at, last_seen_at = now()
    where user_id = v_uid and wedding_id = v_wedding returning * into v_row;
  elsif p_kind = 'export' then
    update public.user_wedding_state set last_export_at = now()
    where user_id = v_uid and wedding_id = v_wedding returning * into v_row;
  else
    update public.user_wedding_state set welcome_dismissed_at = coalesce(welcome_dismissed_at, now())
    where user_id = v_uid and wedding_id = v_wedding returning * into v_row;
  end if;

  return jsonb_build_object(
    'last_seen_at', v_row.last_seen_at,
    'previous_seen_at', v_row.previous_seen_at,
    'last_export_at', v_row.last_export_at,
    'welcome_dismissed_at', v_row.welcome_dismissed_at
  );
end;
$$;

-- record_seen(): last_seen_at -> previous_seen_at. previous_seen_at null = first visit (WelcomeCard).
create function public.record_seen()
returns jsonb
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$ select private.touch_state('seen'); $$;

create function public.record_export()
returns jsonb
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$ select private.touch_state('export'); $$;

create function public.dismiss_welcome()
returns jsonb
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$ select private.touch_state('welcome'); $$;

-- last_heartbeat(source): newest run of the daily job, for Altro > Info (any member).
create function public.last_heartbeat(p_source text default 'daily_job')
returns timestamptz
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if private.current_wedding_id() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select max(h.ran_at) from public.heartbeats h where h.source = p_source);
end;
$$;

-- record_heartbeat(source, details): secret key only (daily job).
create function public.record_heartbeat(p_source text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  insert into public.heartbeats (source, details) values (p_source, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------------------------
-- Login limiter and Auth lookup (secret key only, plan §4.3)
-- ---------------------------------------------------------------------------------------------

-- login_gate(email_key, ip_key): both are sha256 digests computed by the server; the answer
-- depends only on the keys, never on whether the account exists (neutral messages).
create function public.login_gate(p_email_key bytea, p_ip_key bytea default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_until timestamptz;
begin
  if p_email_key is null or octet_length(p_email_key) <> 32
     or (p_ip_key is not null and octet_length(p_ip_key) <> 32) then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;
  select max(la.locked_until) into v_until
  from private.login_attempts la
  where la.key_hash in (p_email_key, coalesce(p_ip_key, p_email_key)) and la.locked_until > now();
  return jsonb_build_object(
    'blocked', v_until is not null,
    'retry_after_seconds', case when v_until is null then 0 else ceil(extract(epoch from (v_until - now())))::int end
  );
end;
$$;

-- Registers one failure on a key (atomic upsert; a finished window or lock restarts the count).
create function private.register_login_failure(p_key bytea, p_max integer, p_window interval, p_lock interval)
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  insert into private.login_attempts as la (key_hash, failed_count, window_start, locked_until)
  values (p_key, 1, now(), case when 1 >= p_max then now() + p_lock end)
  on conflict (key_hash) do update set
    failed_count = case
      when la.locked_until > now() then la.failed_count
      when la.window_start < now() - p_window or la.locked_until <= now() then 1
      else la.failed_count + 1 end,
    window_start = case
      when la.locked_until > now() then la.window_start
      when la.window_start < now() - p_window or la.locked_until <= now() then now()
      else la.window_start end,
    locked_until = case
      when la.locked_until > now() then la.locked_until
      when la.window_start < now() - p_window or la.locked_until <= now()
        then case when 1 >= p_max then now() + p_lock end
      when la.failed_count + 1 >= p_max then now() + p_lock
      else null end;
$$;

-- login_record(email_key, ip_key, success, thresholds): success clears the EMAIL counter only.
create function public.login_record(
  p_email_key bytea,
  p_ip_key bytea,
  p_success boolean,
  p_max_email integer default 5,
  p_max_ip integer default 20,
  p_window_minutes integer default 15,
  p_lock_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_window interval := make_interval(mins => greatest(p_window_minutes, 1));
  v_lock interval := make_interval(mins => greatest(p_lock_minutes, 1));
begin
  if p_email_key is null or octet_length(p_email_key) <> 32
     or (p_ip_key is not null and octet_length(p_ip_key) <> 32)
     or p_max_email < 1 or p_max_ip < 1 then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;

  -- No history beyond the window: drop finished, unlocked rows.
  -- (skip locked: never wait for, or deadlock with, a concurrent failure on the same key)
  delete from private.login_attempts la
  where la.key_hash in (
    select x.key_hash from private.login_attempts x
    where x.window_start < now() - v_window and (x.locked_until is null or x.locked_until <= now())
    for update skip locked
  );

  if p_success then
    -- REV-5: a success clears the EMAIL counter only while it is NOT locked, so a burst of parallel
    -- guesses cannot erase a lock set by the others. The IP key is never cleared by a success.
    delete from private.login_attempts la
    where la.key_hash in (
      select x.key_hash from private.login_attempts x
      where x.key_hash = p_email_key and (x.locked_until is null or x.locked_until <= now())
      for update skip locked
    );
  else
    perform private.register_login_failure(p_email_key, p_max_email, v_window, v_lock);
    if p_ip_key is not null then
      perform private.register_login_failure(p_ip_key, p_max_ip, v_window, v_lock);
    end if;
  end if;
  return public.login_gate(p_email_key, p_ip_key);
end;
$$;

-- auth_user_id_by_email(email): bootstrap ONLY (create-only, idempotent). Account operations never
-- take an id from an email lookup: they use the id returned by the DB step (plan §4.8).
create function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select u.id from auth.users u
  where lower(btrim(u.email)) = lower(btrim(p_email)) and u.deleted_at is null
  limit 1;
$$;

-- ---------------------------------------------------------------------------------------------
-- EXECUTE allowlist (plan §3.1). Everything is revoked first, then granted explicitly.
-- Later migrations: revoke + grant for each new function and extend the allowlist test.
-- ---------------------------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$$;

-- authenticated (has_permission is needed by the RLS policies; it only reveals the caller's own role)
grant execute on function
  public.has_permission(uuid, text, text),
  public.create_wedding(),
  public.accept_pending_invitation(),
  public.create_invitation(text, text, uuid, bytea),
  public.rotate_invitation(uuid, bytea),
  public.revoke_invitation(uuid),
  public.upsert_partner_b(text, text, text, text),
  public.update_partner_email(text, text),
  public.sync_my_email(),
  public.authorize_account_op(text, text, text),
  public.record_seen(),
  public.record_export(),
  public.dismiss_welcome(),
  public.last_heartbeat(text)
to authenticated;

-- secret key only
grant execute on function
  public.record_heartbeat(text, jsonb),
  public.login_gate(bytea, bytea),
  public.login_record(bytea, bytea, boolean, integer, integer, integer, integer),
  public.auth_user_id_by_email(text),
  public.invitation_by_token(bytea)
to service_role;
