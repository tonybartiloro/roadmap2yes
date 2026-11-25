-- FEAT-2026-003 / T1 - Guests: registry, groups/families, optional tables (plan "Dati", ADR-0002).
--
-- Additive only. Three wedding-scoped tables, area `guests` (partner only) with the NEW action
-- `delete`, RPCs for the multi-row operations (family, bulk actions and their undo).
--
-- Personal data rules (ADR-0002, read before touching this file):
--   * audit_row EXCLUDES the personal columns (guests: first_name, last_name, phone, email, notes;
--     guest_groups / guest_tables: name). audit_log keeps who/when/op and the structural fields only.
--   * Soft delete keeps the pointer (P2): a deleted group/table keeps its members; "no group/table"
--     is computed by the app as `id is null or the element is deleted`.
--   * DELETE (hard) is granted but the policy only lets it through on rows that are ALREADY soft
--     deleted and only with `guests/delete`. The FKs of the members are nulled (PG >= 15 syntax).
--   * No anon grant, no anon policy, ever (R-04 will use SECURITY DEFINER RPCs with the secret key).
--   * NEW COLUMN = CLASSIFY IT: the audit exclusion is a deny-list, so a personal column added later
--     must be added to the audit_row arguments below. guests_model.test.sql fails (allowlist of the
--     structural columns) until the author decides.
--   * Conventions of core.sql: business errors P0001 with a stable code, denials 42501.

-- ---------------------------------------------------------------------------------------------
-- Permissions: `delete` joins `read`/`write` (P1) and the partner gets the new area (BR8).
-- ---------------------------------------------------------------------------------------------

alter table private.role_permissions drop constraint role_permissions_action_check;
alter table private.role_permissions
  add constraint role_permissions_action_check check (action in ('read', 'write', 'delete'));

insert into private.role_permissions (role, area, action)
select 'partner', 'guests', x.action
from (values ('read'), ('write'), ('delete')) as x (action);

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.guest_groups (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  name text not null check (char_length(btrim(name)) between 1 and 80 and char_length(name) <= 80),
  -- Set by the import RPC (T12); lets "Annulla importazione" find the batch. Immutable.
  import_batch_id uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (id, wedding_id)
);
create index guest_groups_wedding_idx on public.guest_groups (wedding_id) where deleted_at is null;

-- shape / pos_x / pos_y are stored for R-06 (BR10), unused by the R-03 UI; null position = not placed.
-- No sort_order: the list is ordered by name, R-06 adds whatever it needs.
create table public.guest_tables (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  name text not null check (char_length(btrim(name)) between 1 and 60 and char_length(name) <= 60),
  capacity integer check (capacity between 1 and 50),
  shape text not null default 'round' check (shape in ('round', 'rect')),
  pos_x numeric,
  pos_y numeric,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (id, wedding_id)
);
create index guest_tables_wedding_idx on public.guest_tables (wedding_id) where deleted_at is null;

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  first_name text not null
    check (char_length(btrim(first_name)) between 1 and 80 and char_length(first_name) <= 80),
  -- null = none: '' and blank are refused (the app stores null), like phone and side
  last_name text check (last_name is null or (char_length(btrim(last_name)) >= 1 and char_length(last_name) <= 80)),
  -- extendable by widening the check (DES-16)
  category text not null default 'adult' check (category in ('adult', 'child', 'infant')),
  -- A / B = partner slot, never the partner's name (BR5); null = "Non indicato"
  side text check (side in ('A', 'B', 'both')),
  phone text check (phone ~ '^[0-9+()./ -]{6,20}$'),
  email extensions.citext
    check (char_length(email::text) <= 254 and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  notes text check (char_length(notes) <= 500),
  group_id uuid,
  table_id uuid,
  import_batch_id uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Composite FKs: a guest can never point to a group/table of another wedding. Hard deleting the
  -- group/table nulls ONLY that column (wedding_id is NOT NULL and must stay) - PostgreSQL >= 15.
  foreign key (group_id, wedding_id) references public.guest_groups (id, wedding_id)
    on delete set null (group_id),
  foreign key (table_id, wedding_id) references public.guest_tables (id, wedding_id)
    on delete set null (table_id)
);
create index guests_wedding_idx on public.guests (wedding_id) where deleted_at is null;
create index guests_group_idx on public.guests (group_id);
create index guests_table_idx on public.guests (table_id);

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

-- Stamps deleted_at/deleted_by on a soft delete (the client only sends deleted_at, never deleted_by)
-- and freezes them while the state does not change. Same rule as tasks.
create function private.guests_stamp_soft_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if new.deleted_at is not null then
      new.deleted_at := now();
      new.deleted_by := auth.uid();
    else
      new.deleted_by := null;
    end if;
  else
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

-- No guest can be ASSIGNED to a deleted group/table (insert, or the pointer changes). The target row
-- is locked FOR SHARE so a concurrent soft delete of it is serialized. SECURITY DEFINER only so the
-- check does not depend on the caller's privileges; it reveals nothing (it only raises).
create function private.guests_guard_refs()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_deleted timestamptz;
  v_found boolean;
begin
  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id) then
    select g.deleted_at, true into v_deleted, v_found
    from public.guest_groups g where g.id = new.group_id and g.wedding_id = new.wedding_id for share;
    if v_found and v_deleted is not null then
      raise exception 'group_deleted' using errcode = 'P0001';
    end if;
  end if;
  if new.table_id is not null and (tg_op = 'INSERT' or new.table_id is distinct from old.table_id) then
    v_found := null;
    select t.deleted_at, true into v_deleted, v_found
    from public.guest_tables t where t.id = new.table_id and t.wedding_id = new.wedding_id for share;
    if v_found and v_deleted is not null then
      raise exception 'table_deleted' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger guest_groups_set_audit_cols before insert on public.guest_groups
  for each row execute function private.set_audit_cols();
create trigger guest_groups_bump_version before update on public.guest_groups
  for each row execute function private.bump_version();
create trigger guest_groups_guard before update on public.guest_groups
  for each row execute function private.guard_row('import_batch_id');
create trigger guest_groups_soft_delete before update on public.guest_groups
  for each row execute function private.guests_stamp_soft_delete();

create trigger guest_tables_set_audit_cols before insert on public.guest_tables
  for each row execute function private.set_audit_cols();
create trigger guest_tables_bump_version before update on public.guest_tables
  for each row execute function private.bump_version();
create trigger guest_tables_guard before update on public.guest_tables
  for each row execute function private.guard_row();
create trigger guest_tables_soft_delete before update on public.guest_tables
  for each row execute function private.guests_stamp_soft_delete();

create trigger guests_set_audit_cols before insert on public.guests
  for each row execute function private.set_audit_cols();
create trigger guests_bump_version before update on public.guests
  for each row execute function private.bump_version();
create trigger guests_guard before update on public.guests
  for each row execute function private.guard_row('import_batch_id');
create trigger guests_soft_delete before update on public.guests
  for each row execute function private.guests_stamp_soft_delete();
create trigger guests_guard_refs before insert or update on public.guests
  for each row execute function private.guests_guard_refs();

-- Audit (BR14) WITHOUT personal data (ADR-0002 section 1): the excluded columns are never copied.
create trigger guests_audit after insert or update or delete on public.guests
  for each row execute function private.audit_row('first_name', 'last_name', 'phone', 'email', 'notes');
create trigger guest_groups_audit after insert or update or delete on public.guest_groups
  for each row execute function private.audit_row('name');
create trigger guest_tables_audit after insert or update or delete on public.guest_tables
  for each row execute function private.audit_row('name');

-- ---------------------------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------------------------

alter table public.guest_groups enable row level security;
alter table public.guest_tables enable row level security;
alter table public.guests enable row level security;

create policy guest_groups_select on public.guest_groups for select to authenticated
  using (public.has_permission(wedding_id, 'guests', 'read'));
create policy guest_groups_insert on public.guest_groups for insert to authenticated
  with check (public.has_permission(wedding_id, 'guests', 'write'));
create policy guest_groups_update on public.guest_groups for update to authenticated
  using (public.has_permission(wedding_id, 'guests', 'write'))
  with check (public.has_permission(wedding_id, 'guests', 'write'));
create policy guest_groups_delete on public.guest_groups for delete to authenticated
  using (deleted_at is not null and public.has_permission(wedding_id, 'guests', 'delete'));

create policy guest_tables_select on public.guest_tables for select to authenticated
  using (public.has_permission(wedding_id, 'guests', 'read'));
create policy guest_tables_insert on public.guest_tables for insert to authenticated
  with check (public.has_permission(wedding_id, 'guests', 'write'));
create policy guest_tables_update on public.guest_tables for update to authenticated
  using (public.has_permission(wedding_id, 'guests', 'write'))
  with check (public.has_permission(wedding_id, 'guests', 'write'));
create policy guest_tables_delete on public.guest_tables for delete to authenticated
  using (deleted_at is not null and public.has_permission(wedding_id, 'guests', 'delete'));

create policy guests_select on public.guests for select to authenticated
  using (public.has_permission(wedding_id, 'guests', 'read'));
create policy guests_insert on public.guests for insert to authenticated
  with check (public.has_permission(wedding_id, 'guests', 'write'));
create policy guests_update on public.guests for update to authenticated
  using (public.has_permission(wedding_id, 'guests', 'write'))
  with check (public.has_permission(wedding_id, 'guests', 'write'));
create policy guests_delete on public.guests for delete to authenticated
  using (deleted_at is not null and public.has_permission(wedding_id, 'guests', 'delete'));

grant select, delete on public.guest_groups, public.guest_tables, public.guests to authenticated;

-- Never writable by a user: id, wedding_id (after insert), version, created_*/updated_*, deleted_by,
-- import_batch_id. deleted_at is writable (soft delete / restore); the trigger stamps deleted_by.
grant insert (wedding_id, name) on public.guest_groups to authenticated;
grant update (name, deleted_at) on public.guest_groups to authenticated;

grant insert (wedding_id, name, capacity, shape, pos_x, pos_y) on public.guest_tables to authenticated;
grant update (name, capacity, shape, pos_x, pos_y, deleted_at) on public.guest_tables to authenticated;

grant insert (wedding_id, first_name, last_name, category, side, phone, email, notes, group_id, table_id)
  on public.guests to authenticated;
grant update (first_name, last_name, category, side, phone, email, notes, group_id, table_id, deleted_at)
  on public.guests to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------------------------

-- create_guest_family(name, side, rows) -> { group_id, guest_ids }   (AC5, atomic)
-- One group and its people in ONE transaction: an invalid row (or name) rolls everything back with
-- `invalid_row`. `p_side` (A | B | both | null) applies to every person. Each row is an object with
-- first_name (required), last_name, category (default adult), phone, email, notes. SECURITY DEFINER
-- because the wedding comes from the caller's membership; the table checks still validate every value.
create function public.create_guest_family(p_name text, p_side text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_group uuid;
  v_ids uuid[] := '{}';
  v_row jsonb;
  v_id uuid;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_row' using errcode = 'P0001';
  end if;
  -- A family, not an import: a per-call bound (REV-7). NOT a limit on the total number of guests.
  if jsonb_array_length(p_rows) > 100 then
    raise exception 'too_many_rows' using errcode = 'P0001';
  end if;
  begin
    insert into public.guest_groups (wedding_id, name) values (v_wedding, p_name) returning id into v_group;
    for v_row in select e from jsonb_array_elements(p_rows) e loop
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'invalid_row' using errcode = 'P0001';
      end if;
      insert into public.guests (wedding_id, first_name, last_name, category, side, phone, email, notes, group_id)
      values (
        v_wedding,
        v_row ->> 'first_name',
        v_row ->> 'last_name',
        coalesce(v_row ->> 'category', 'adult'),
        p_side,
        v_row ->> 'phone',
        v_row ->> 'email',
        v_row ->> 'notes',
        v_group
      )
      returning id into v_id;
      v_ids := v_ids || v_id;
    end loop;
  exception when check_violation or not_null_violation or invalid_text_representation
    or string_data_right_truncation then
    raise exception 'invalid_row' using errcode = 'P0001';
  end;
  return jsonb_build_object('group_id', v_group, 'guest_ids', to_jsonb(v_ids));
end;
$$;

-- guests_bulk(ids, op, target) -> { previous: [{id, op, group_id, table_id, deleted}], changed }   (AC7, P6)
-- op: assign_group | assign_table (target = a live group/table) | delete | restore.
-- SECURITY INVOKER: RLS and column grants apply, so someone without `guests/write` (or ids of another
-- wedding) changes nothing and gets `changed: 0`. `previous` lists ONLY the rows this call changed,
-- with the values they had BEFORE (read under row lock), and is what guests_bulk_undo takes back.
-- Deleted guests are skipped by the assign ops. The ids travel in the body, at most 1000 per call (the app batches).
create function public.guests_bulk(p_ids uuid[], p_op text, p_target uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_deleted timestamptz;
  v_prev jsonb;
  v_ids uuid[];
  v_changed integer := 0;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_op is null or p_op not in ('assign_group', 'assign_table', 'delete', 'restore') then
    raise exception 'invalid_op' using errcode = 'P0001';
  end if;
  -- Per-call bound (REV-7); the app splits larger selections into batches of 1000: no total cap.
  if p_ids is null or cardinality(p_ids) > 1000 then
    raise exception 'invalid_ids' using errcode = 'P0001';
  end if;

  if p_op = 'assign_group' then
    select g.deleted_at into v_deleted from public.guest_groups g where g.id = p_target;
    if not found then
      raise exception 'invalid_target' using errcode = 'P0001';
    end if;
    if v_deleted is not null then
      raise exception 'group_deleted' using errcode = 'P0001';
    end if;
  elsif p_op = 'assign_table' then
    select t.deleted_at into v_deleted from public.guest_tables t where t.id = p_target;
    if not found then
      raise exception 'invalid_target' using errcode = 'P0001';
    end if;
    if v_deleted is not null then
      raise exception 'table_deleted' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'op', p_op, 'group_id', x.group_id, 'table_id', x.table_id,
           'deleted', x.deleted_at is not null) order by x.id), '[]'::jsonb),
         coalesce(array_agg(x.id), '{}'::uuid[])
  into v_prev, v_ids
  from (
    select g.id, g.group_id, g.table_id, g.deleted_at
    from public.guests g
    where g.id = any (p_ids)
      and case p_op
        when 'assign_group' then g.deleted_at is null and g.group_id is distinct from p_target
        when 'assign_table' then g.deleted_at is null and g.table_id is distinct from p_target
        when 'delete' then g.deleted_at is null
        else g.deleted_at is not null
      end
    order by g.id
    for update
  ) x;

  if p_op = 'assign_group' then
    update public.guests set group_id = p_target where id = any (v_ids);
  elsif p_op = 'assign_table' then
    update public.guests set table_id = p_target where id = any (v_ids);
  elsif p_op = 'delete' then
    update public.guests set deleted_at = now() where id = any (v_ids);
  else
    update public.guests set deleted_at = null where id = any (v_ids);
  end if;
  get diagnostics v_changed = row_count;
  return jsonb_build_object('previous', v_prev, 'changed', v_changed);
end;
$$;

-- guests_bulk_undo(previous) -> { restored }   (AC7: the last save wins)
-- Takes the `previous` array that guests_bulk returned and puts the saved values back: only the
-- column the op touched (group_id for assign_group, table_id for assign_table, the deleted state for
-- delete/restore). Skips ids that no longer exist (or are not visible), assignments of guests deleted
-- in the meantime and assignments back to a group/table deleted in the meantime. SECURITY INVOKER.
create function public.guests_bulk_undo(p_previous jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_restored integer := 0;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_previous is null or jsonb_typeof(p_previous) <> 'array'
     or jsonb_array_length(p_previous) > 1000
     or exists (
       select 1 from jsonb_array_elements(p_previous) x
       where jsonb_typeof(x) <> 'object'
          or (x ->> 'op') is null
          or (x ->> 'op') not in ('assign_group', 'assign_table', 'delete', 'restore')
     ) then
    raise exception 'invalid_previous' using errcode = 'P0001';
  end if;

  begin
    with e as (
      select (x ->> 'id')::uuid as id,
             x ->> 'op' as op,
             nullif(x ->> 'group_id', '')::uuid as group_id,
             nullif(x ->> 'table_id', '')::uuid as table_id,
             coalesce((x ->> 'deleted')::boolean, false) as deleted
      from jsonb_array_elements(p_previous) x
    )
    update public.guests g
    set group_id = case when e.op = 'assign_group' then e.group_id else g.group_id end,
        table_id = case when e.op = 'assign_table' then e.table_id else g.table_id end,
        deleted_at = case
          when e.op in ('delete', 'restore') then case when e.deleted then now() else null end
          else g.deleted_at
        end
    from e
    where g.id = e.id
      and case e.op
        when 'assign_group' then g.deleted_at is null and (e.group_id is null or exists (
          select 1 from public.guest_groups gg where gg.id = e.group_id and gg.deleted_at is null))
        when 'assign_table' then g.deleted_at is null and (e.table_id is null or exists (
          select 1 from public.guest_tables gt where gt.id = e.table_id and gt.deleted_at is null))
        else (g.deleted_at is not null) is distinct from e.deleted
      end;
    get diagnostics v_restored = row_count;
  exception when invalid_text_representation then
    raise exception 'invalid_previous' using errcode = 'P0001';
  end;
  return jsonb_build_object('restored', v_restored);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- EXECUTE: revoke from everybody first, then grant explicitly (service_role keeps the default).
-- ---------------------------------------------------------------------------------------------

revoke all on function
  public.create_guest_family(text, text, jsonb),
  public.guests_bulk(uuid[], text, uuid),
  public.guests_bulk_undo(jsonb),
  private.guests_stamp_soft_delete(),
  private.guests_guard_refs()
from public, anon, authenticated;

grant execute on function
  public.create_guest_family(text, text, jsonb),
  public.guests_bulk(uuid[], text, uuid),
  public.guests_bulk_undo(jsonb)
to authenticated;
