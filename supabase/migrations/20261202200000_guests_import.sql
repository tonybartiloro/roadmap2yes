-- FEAT-2026-003 / T12 - Guests import (plan "Import", P3, P4, ADR-0002). Additive only.
--
-- The CSV/text is parsed in the browser and re-validated by the server action; these two RPCs write
-- the rows atomically and undo a batch. Both are SECURITY DEFINER because `import_batch_id` is not
-- writable by users (no column grant): the wedding comes from the caller's membership, never from
-- a parameter, and the permission is checked first. Errors: P0001 with a stable code
-- (`invalid_row`, `too_many_rows`, `payload_too_large`), 42501 for denials.
--
-- Personal data: the audit exclusions of the guests tables (ADR-0002) apply to these writes too,
-- and no error message carries a value (every check failure is collapsed into `invalid_row`).

-- Batches are looked up by id (undo): a partial index keeps it cheap without touching other queries.
create index guests_import_batch_idx on public.guests (import_batch_id) where import_batch_id is not null;
create index guest_groups_import_batch_idx on public.guest_groups (import_batch_id) where import_batch_id is not null;

-- Group matching key (REV-40): MUST equal `groupKey` of src/domain/guests/csv-import.ts, which is
-- `name.replace(/\s+/g, " ").trim().toLowerCase()`. JS `\s` covers NBSP and the Unicode spaces and
-- Postgres `btrim`/`\s` do not, so the set is spelled out here: TAB LF VT FF CR SPACE, U+00A0,
-- U+1680, U+2000-200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF (exactly ECMAScript WhiteSpace
-- + LineTerminator). The key is computed in SQL (not sent by the client) because existing groups
-- need it too, and a client-supplied key would be one more thing to trust. Accents are kept (AC18).
-- Residual: `lower()` follows the database locale; exotic cases (dotted capital I, final sigma)
-- may differ from JS, which only means a group is created instead of reused, never a wrong merge.
create function private.guest_trim_ws(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select regexp_replace(p_text,
    '^[\t\n\v\f\r    -     　﻿]+|[\t\n\v\f\r    -     　﻿]+$',
    '', 'g');
$$;

create function private.guest_group_key(p_name text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select lower(private.guest_trim_ws(regexp_replace(p_name,
    '[\t\n\v\f\r    -     　﻿]+', ' ', 'g')));
$$;

-- import_guests(rows) -> { batch_id, guests, groups }
-- rows: array of { first_name, last_name, category, side, group, phone, email, notes } (the contract
-- of src/domain/guests/csv-import.ts `toImportPayload`). `group` is a NAME: an existing LIVE group of
-- the wedding with the same name (case and spaces ignored, accents NOT ignored: AC18) is reused;
-- otherwise one is created, once per name, tagged with the batch id. Every person gets the batch id.
-- All or nothing: one invalid row rolls the whole import back with `invalid_row`.
-- Limits are rechecked here (the client guard is not a security boundary): 500 rows, and a payload
-- size above ~940 KB (the client stays under 900 KB; jsonb text adds a few spaces) is refused.
create function public.import_guests(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_batch uuid := gen_random_uuid();
  v_groups jsonb := '{}'::jsonb;  -- normalized group name -> group id
  v_row jsonb;
  v_name text;
  v_key text;
  v_group uuid;
  v_guests integer := 0;
  v_new_groups integer := 0;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_row' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'too_many_rows' using errcode = 'P0001';
  end if;
  if octet_length(p_rows::text) > 960000 then
    raise exception 'payload_too_large' using errcode = 'P0001';
  end if;

  begin
    for v_row in select e from jsonb_array_elements(p_rows) e loop
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'invalid_row' using errcode = 'P0001';
      end if;
      v_group := null;
      v_name := nullif(private.guest_trim_ws(v_row ->> 'group'), '');
      if v_name is not null then
        v_key := private.guest_group_key(v_name);
        if v_groups ? v_key then
          v_group := (v_groups ->> v_key)::uuid;
        else
          select g.id into v_group
          from public.guest_groups g
          where g.wedding_id = v_wedding and g.deleted_at is null
            and private.guest_group_key(g.name) = v_key
          order by g.created_at, g.id
          limit 1;
          if v_group is null then
            insert into public.guest_groups (wedding_id, name, import_batch_id)
            values (v_wedding, v_name, v_batch)
            returning id into v_group;
            v_new_groups := v_new_groups + 1;
          end if;
          v_groups := v_groups || jsonb_build_object(v_key, v_group);
        end if;
      end if;

      insert into public.guests
        (wedding_id, first_name, last_name, category, side, phone, email, notes, group_id, import_batch_id)
      values (
        v_wedding,
        v_row ->> 'first_name',
        v_row ->> 'last_name',
        coalesce(v_row ->> 'category', 'adult'),
        v_row ->> 'side',
        v_row ->> 'phone',
        v_row ->> 'email',
        v_row ->> 'notes',
        v_group,
        v_batch
      );
      v_guests := v_guests + 1;
    end loop;
  exception when check_violation or not_null_violation or invalid_text_representation
    or string_data_right_truncation then
    raise exception 'invalid_row' using errcode = 'P0001';
  end;
  return jsonb_build_object('batch_id', v_batch, 'guests', v_guests, 'groups', v_new_groups);
end;
$$;

-- undo_guest_import(batch_id) -> { guests, groups }   ("Annulla importazione", AC20, P4)
-- PHYSICALLY deletes the people of that batch (so their personal data does not linger in a
-- "Eliminati di recente" list) and the groups the batch CREATED that are left without any member
-- (a group someone filled meanwhile, or an existing group the import only reused, stays).
-- Scoped to the caller's wedding: a batch of another wedding, or an unknown one, changes nothing.
-- Needs `guests/delete` (it is a hard delete).
create function public.undo_guest_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_guests integer := 0;
  v_groups integer := 0;
begin
  if auth.uid() is null or v_wedding is null or not public.has_permission(v_wedding, 'guests', 'delete') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_batch_id is null then
    return jsonb_build_object('guests', 0, 'groups', 0);
  end if;

  delete from public.guests g where g.wedding_id = v_wedding and g.import_batch_id = p_batch_id;
  get diagnostics v_guests = row_count;

  delete from public.guest_groups gg
  where gg.wedding_id = v_wedding and gg.import_batch_id = p_batch_id
    and not exists (select 1 from public.guests m where m.group_id = gg.id and m.wedding_id = gg.wedding_id);
  get diagnostics v_groups = row_count;

  return jsonb_build_object('guests', v_guests, 'groups', v_groups);
end;
$$;

revoke all on function
  private.guest_trim_ws(text),
  private.guest_group_key(text),
  public.import_guests(jsonb),
  public.undo_guest_import(uuid)
from public, anon, authenticated;

grant execute on function
  public.import_guests(jsonb),
  public.undo_guest_import(uuid)
to authenticated;
