-- QA (T17a): forbidden-writes / grants matrix GENERATED FROM THE CATALOG (plan, test plan row
-- "Matrice RLS/grant/scritture vietate, generata dal catalogo").
--
-- How it works: `qa_tables` and `qa_functions` below are the ORACLE (plan 3.1 write matrix and the
-- EXECUTE allowlist). Every assertion compares the oracle with the live catalog, in both
-- directions:
--   * a table/view/function in `public` WITHOUT an entry here  -> the first tests FAIL (CI red);
--   * an entry whose object no longer exists                   -> FAIL;
--   * any grant, policy, FK or function attribute that differs from the entry -> FAIL.
-- To add a table: add a row to qa_tables (and to tests/acceptance/support/matrix.ts, which does the
-- same for the PostgREST layer). Nobody gets to skip the matrix by forgetting it.
begin;
select plan(32);

-- ---------------------------------------------------------------------------------------------
-- Oracle: tables. tenancy: 'wedding' (policy via has_permission), 'own' (also user_id = auth.uid()),
-- 'service' (RLS on, no policy, no grant to API roles). sel_hidden = columns authenticated cannot read.
-- ins/upd = the ONLY columns authenticated may INSERT/UPDATE. del = DELETE allowed (own rows only);
-- del_soft = ... and the DELETE policy only lets SOFT-DELETED rows through (guests, ADR-0002).
-- ---------------------------------------------------------------------------------------------
create temp table qa_tables (
  name text primary key, tenancy text not null, sel_hidden text[] not null default '{}',
  ins text[] not null default '{}', upd text[] not null default '{}', del boolean not null default false,
  del_soft boolean not null default false
);
insert into qa_tables (name, tenancy, sel_hidden, ins, upd, del) values
  ('weddings', 'wedding', '{}', '{}',
    '{comune,guest_band,onboarding_answers,onboarding_unknown,region,rite,style_label,style_note,theme_id}', false),
  ('wedding_partners', 'wedding', '{}', '{}', '{first_name,label,last_name}', false),
  ('memberships', 'wedding', '{}', '{}', '{}', false),
  ('user_wedding_state', 'own', '{}', '{}', '{}', false),
  ('account_events', 'wedding', '{}', '{}', '{}', false),
  ('invitations', 'wedding', '{token_hash}', '{}', '{}', false),
  ('audit_log', 'wedding', '{}', '{}', '{}', false),
  ('heartbeats', 'service', '{}', '{}', '{}', false),
  ('notification_log', 'service', '{}', '{}', '{}', false),
  ('decisions', 'wedding', '{}', '{}', '{question}', false),
  ('decision_options', 'wedding', '{}',
    '{comune,cons,cost_cents,decision_id,link,notes,pros,title,wedding_id}',
    '{comune,cons,cost_cents,deleted_at,link,notes,pros,title}', false),
  ('date_scenarios', 'wedding', '{}',
    '{date_from,date_to,kind,location_option_id,option_id,wedding_id}',
    '{date_from,date_to,kind,location_option_id}', false),
  ('decision_events', 'wedding', '{}', '{}', '{}', false),
  ('option_reactions', 'own', '{}', '{option_id,reaction,user_id,wedding_id}', '{reaction}', true),
  ('task_suggestion_dismissals', 'wedding', '{}', '{kind,template_key,wedding_id}', '{}', false),
  ('tasks', 'wedding', '{}',
    '{assignee,category,due_date,notes,reminders_enabled,title,wedding_id}',
    '{assignee,category,deleted_at,due_date,notes,reminders_enabled,status,title}', false),
  ('budget_versions', 'wedding', '{}', '{reason,total_cents,wedding_id}', '{}', false),
  ('budget_categories', 'wedding', '{}',
    '{assigned_cents,default_key,name,sort_order,wedding_id}',
    '{assigned_cents,deleted_at,name,sort_order}', false),
  ('budget_items', 'wedding', '{}',
    '{agreed_cents,category_id,description,planned_cents,status,wedding_id}',
    '{agreed_cents,deleted_at,description,planned_cents,status}', false),
  ('payments', 'wedding', '{}',
    '{amount_cents,due_date,item_id,kind,paid,paid_on,wedding_id}',
    '{amount_cents,deleted_at,due_date,kind,paid,paid_on}', false),
  ('notification_preferences', 'own', '{}',
    '{digest_enabled,reminders_enabled,user_id,wedding_id}', '{digest_enabled,reminders_enabled}', false);
-- FEAT-2026-003: the only tables with a hard DELETE on domain data, and only on soft-deleted rows.
insert into qa_tables (name, tenancy, sel_hidden, ins, upd, del, del_soft) values
  ('guest_groups', 'wedding', '{}', '{name,wedding_id}', '{deleted_at,name}', true, true),
  ('guest_tables', 'wedding', '{}', '{capacity,name,pos_x,pos_y,shape,wedding_id}',
    '{capacity,deleted_at,name,pos_x,pos_y,shape}', true, true),
  ('guests', 'wedding', '{}', '{category,email,first_name,group_id,last_name,notes,phone,side,table_id,wedding_id}',
    '{category,deleted_at,email,first_name,group_id,last_name,notes,phone,side,table_id}', true, true);

-- Oracle: functions in `public`. 'user' = EXECUTE for authenticated (plan 3.1 allowlist; the two
-- marked * are not in the plan text but were added and accepted in the T2/T9 reviews:
-- has_permission is used by every RLS policy, move_budget_items is the P5 "Sposta in..." RPC).
-- 'service' = EXECUTE for the secret key only.
create temp table qa_functions (name text primary key, klass text not null);
insert into qa_functions (name, klass) values
  ('create_wedding', 'user'), ('complete_onboarding', 'user'), ('accept_pending_invitation', 'user'),
  ('create_invitation', 'user'), ('rotate_invitation', 'user'), ('revoke_invitation', 'user'),
  ('upsert_partner_b', 'user'), ('update_partner_email', 'user'), ('sync_my_email', 'user'),
  ('authorize_account_op', 'user'), ('choose_option', 'user'), ('reopen_decision', 'user'),
  ('add_decision_note', 'user'), ('set_reference_scenario', 'user'), ('acknowledge_task_review', 'user'),
  ('insert_template_tasks', 'user'), ('record_seen', 'user'), ('record_export', 'user'),
  ('dismiss_welcome', 'user'), ('last_heartbeat', 'user'),
  ('has_permission', 'user'),        -- *
  ('move_budget_items', 'user'),     -- *
  ('create_guest_family', 'user'), ('guests_bulk', 'user'), ('guests_bulk_undo', 'user'),  -- FEAT-2026-003
  ('import_guests', 'user'), ('undo_guest_import', 'user'),
  ('record_heartbeat', 'service'), ('login_gate', 'service'), ('login_record', 'service'),
  ('auth_user_id_by_email', 'service'), ('invitation_by_token', 'service'), ('sync_timeline', 'service'),
  ('job_claim_notification', 'service'), ('job_fail_notification', 'service'),
  ('job_mark_notification_sent', 'service'), ('job_quota_status', 'service'),
  ('job_recipients', 'service'), ('job_sent_item_keys', 'service'), ('job_unsubscribe', 'service');

-- Helpers (pg_temp: vanish with the transaction).
create function pg_temp.srt(p text[]) returns text[] language sql immutable as
  $$ select coalesce(array(select e from unnest(p) e order by e collate "C"), '{}') $$;
create function pg_temp.allcols(p_table text) returns text[] language sql stable as
  $$ select coalesce(array_agg(a.attname::text order by a.attname::text collate "C"), '{}')
     from pg_attribute a where a.attrelid = ('public.' || quote_ident(p_table))::regclass
       and a.attnum > 0 and not a.attisdropped $$;
create function pg_temp.cols(p_table text, p_role text, p_priv text) returns text[] language sql stable as
  $$ select coalesce(array_agg(a.attname::text order by a.attname::text collate "C"), '{}')
     from pg_attribute a where a.attrelid = ('public.' || quote_ident(p_table))::regclass
       and a.attnum > 0 and not a.attisdropped and has_column_privilege(p_role, a.attrelid, a.attnum, p_priv) $$;
create function pg_temp.empty(p text[]) returns text[] language sql immutable as $$ select coalesce(p, '{}') $$;

-- 1-2. COMPLETENESS: every relation and every function in public has an entry, and vice versa.
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname::text collate "C"), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and c.relname::text not in (select name from qa_tables)),
  '{}'::text[], 'every table/view in public has a matrix entry (a new one without an entry fails CI)');
select is(
  (select coalesce(array_agg(t.name order by t.name collate "C"), '{}') from qa_tables t
   where not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace
     and c.relname::text = t.name and c.relkind in ('r', 'p'))),
  '{}'::text[], 'every table entry of the matrix still exists as a table (no stale entries)');
select is(
  (select coalesce(array_agg(n order by n collate "C"), '{}')
   from (select distinct p.proname::text n from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.prokind in ('f', 'p') and p.proname::text not in (select name from qa_functions)) x),
  '{}'::text[], 'every function in public has a matrix entry (a new one without an entry fails CI)');
select is(
  (select coalesce(array_agg(f.name order by f.name collate "C"), '{}') from qa_functions f
   where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname::text = f.name)),
  '{}'::text[], 'every function entry of the matrix still exists (no stale entries)');
select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname::text in (select name from qa_functions) group by p.proname having count(*) > 1 limit 1),
  null, 'no overloads: each function name maps to one signature, so the matrix entry is unambiguous');

-- 6. RLS enabled on every public table.
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname::text collate "C"), '{}')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[], 'RLS enabled on every public table');

-- 7-10. TABLE GRANTS == matrix, column by column.
select is(
  (select coalesce(array_agg(t.name || ' has ' || pg_temp.cols(t.name, 'authenticated', 'select')::text order by t.name collate "C"), '{}')
   from qa_tables t
   where pg_temp.cols(t.name, 'authenticated', 'select') is distinct from
     case when t.tenancy = 'service' then '{}'::text[]
          else pg_temp.srt(array(select c from unnest(pg_temp.allcols(t.name)) c where c <> all (t.sel_hidden))) end),
  '{}'::text[], 'authenticated SELECT columns: everything except the hidden ones (token_hash), nothing on service tables');
select is(
  (select coalesce(array_agg(t.name || ' has ' || pg_temp.cols(t.name, 'authenticated', 'insert')::text order by t.name collate "C"), '{}')
   from qa_tables t where pg_temp.cols(t.name, 'authenticated', 'insert') is distinct from pg_temp.srt(t.ins)),
  '{}'::text[], 'authenticated INSERT columns equal the matrix exactly (no table-level INSERT)');
select is(
  (select coalesce(array_agg(t.name || ' has ' || pg_temp.cols(t.name, 'authenticated', 'update')::text order by t.name collate "C"), '{}')
   from qa_tables t where pg_temp.cols(t.name, 'authenticated', 'update') is distinct from pg_temp.srt(t.upd)),
  '{}'::text[], 'authenticated UPDATE columns equal the matrix exactly (no table-level UPDATE)');
select is(
  (select coalesce(array_agg(t.name order by t.name collate "C"), '{}') from qa_tables t
   where has_table_privilege('authenticated', ('public.' || quote_ident(t.name))::regclass, 'delete') is distinct from t.del
      or has_table_privilege('authenticated', ('public.' || quote_ident(t.name))::regclass, 'truncate')
      or has_table_privilege('authenticated', ('public.' || quote_ident(t.name))::regclass, 'trigger')
      or has_table_privilege('authenticated', ('public.' || quote_ident(t.name))::regclass, 'references')),
  '{}'::text[], 'authenticated DELETE only where the oracle says (option_reactions, guests tables); never TRUNCATE/TRIGGER/REFERENCES');
select is(
  (select coalesce(array_agg(t.name || ':' || p order by t.name collate "C", p), '{}')
   from qa_tables t cross join unnest(array['select', 'insert', 'update', 'references']) p
   where pg_temp.cols(t.name, 'anon', p) <> '{}'::text[]),
  '{}'::text[], 'anon has no column privilege of any kind on any table');
select is(
  (select coalesce(array_agg(t.name order by t.name collate "C"), '{}') from qa_tables t
   where has_table_privilege('anon', ('public.' || quote_ident(t.name))::regclass, 'delete')
      or has_table_privilege('anon', ('public.' || quote_ident(t.name))::regclass, 'truncate')
      or has_table_privilege('anon', ('public.' || quote_ident(t.name))::regclass, 'trigger')),
  '{}'::text[], 'anon has no DELETE/TRUNCATE/TRIGGER on any table');

-- 13. Immutable / system columns are never writable by a user, on any table (generated from the catalog,
--     not from the entries: a column added to a grant list by mistake is caught here).
select is(
  (select coalesce(array_agg(t.name || '.' || c order by t.name collate "C", c), '{}')
   from qa_tables t cross join lateral unnest(pg_temp.cols(t.name, 'authenticated', 'update')) c
   where c in ('id', 'wedding_id', 'user_id', 'version', 'created_at', 'created_by', 'updated_at', 'updated_by',
               'deleted_by', 'slot', 'method', 'token_hash', 'completed_at', 'completed_by', 'source',
               'template_key', 'template_version', 'template_offset', 'needs_review', 'due_overridden')),
  '{}'::text[], 'no table lets a user UPDATE id, wedding_id, user_id, version, created_*/updated_*, template/completed/needs_review columns');
select is(
  (select coalesce(array_agg(t.name || '.' || c order by t.name collate "C", c), '{}')
   from qa_tables t cross join lateral unnest(pg_temp.cols(t.name, 'authenticated', 'insert')) c
   where c in ('id', 'version', 'created_at', 'created_by', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by',
               'source', 'template_key', 'template_version', 'template_offset', 'needs_review', 'due_overridden',
               'completed_at', 'completed_by', 'status', 'applied_reference_date') and not (t.name = 'budget_items' and c = 'status')
     and not (t.name = 'task_suggestion_dismissals' and c = 'template_key')),
  '{}'::text[], 'no table lets a user INSERT system columns (id/version/created_*/source/template_*/status...) except budget_items.status');

-- 15-17. POLICIES == grants.
select is(
  (select coalesce(array_agg(c.relname || '.' || p.polname order by c.relname collate "C", p.polname), '{}')
   from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relnamespace = 'public'::regnamespace
     and p.polroles is distinct from array[(select oid from pg_roles where rolname = 'authenticated')]),
  '{}'::text[], 'every policy is TO authenticated only (none for anon or PUBLIC)');
select is(
  (select coalesce(array_agg(t.name order by t.name collate "C"), '{}') from qa_tables t
   where array(select p.polcmd::text from pg_policy p where p.polrelid = ('public.' || quote_ident(t.name))::regclass
               order by p.polcmd::text collate "C")
     is distinct from array(select e from unnest(
         case when t.tenancy = 'service' then '{}'::text[] else array['r'] end
         || case when t.ins <> '{}' then array['a'] else '{}'::text[] end
         || case when t.upd <> '{}' then array['w'] else '{}'::text[] end
         || case when t.del then array['d'] else '{}'::text[] end) e order by e collate "C")),
  '{}'::text[], 'policy commands per table == granted commands (no dead grant, no dead policy; service tables have none)');
select is(
  (select coalesce(array_agg(c.relname || '.' || p.polname order by c.relname collate "C", p.polname), '{}')
   from pg_policy p join pg_class c on c.oid = p.polrelid join qa_tables t on t.name = c.relname::text
   where c.relnamespace = 'public'::regnamespace
     and (
       -- every policy is anchored on the DB membership check (never on the JWT alone)
       coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%has_permission(%'
       -- ... 'own' tables also pin the row to the caller
       or (t.tenancy = 'own' and p.polcmd <> 'r' and coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%auth.uid()%')
       or (t.tenancy = 'own' and p.polcmd = 'r' and t.name <> 'option_reactions' and coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%auth.uid()%')
       -- UPDATE needs both USING and WITH CHECK (else a row could be moved out of the wedding)
       or (p.polcmd = 'w' and (p.polqual is null or p.polwithcheck is null))
       -- INSERT needs WITH CHECK
       or (p.polcmd = 'a' and p.polwithcheck is null)
       -- the JWT's app_metadata/user_metadata is never an authorization source for rows
       or coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* '(app_metadata|user_metadata|auth\.jwt)')),
  '{}'::text[], 'policies use has_permission (DB membership), own-row tables pin auth.uid(), UPDATE has USING + CHECK, no JWT metadata');

-- 18. Composite FKs: a child can never point to a parent of another wedding.
select is(
  (select coalesce(array_agg(con.conrelid::regclass::text || '->' || con.confrelid::regclass::text || ' (' || con.conname || ')' order by con.conname collate "C"), '{}')
   from pg_constraint con
   where con.contype = 'f' and con.connamespace = 'public'::regnamespace
     and con.confrelid <> 'public.weddings'::regclass
     and con.confrelid::regclass::text !~ '^auth\.'
     -- every public-to-public FK must include the child's wedding_id (or id for weddings itself)
     and not exists (select 1 from pg_attribute a where a.attrelid = con.conrelid and a.attnum = any (con.conkey)
                     and a.attname = case when con.conrelid = 'public.weddings'::regclass then 'id' else 'wedding_id' end)),
  '{}'::text[], 'every FK between public tables is composite and carries wedding_id (cross-wedding parent impossible)');
select is(
  (select coalesce(array_agg(con.conrelid::regclass::text || '.' || con.conname order by con.conname collate "C"), '{}')
   from pg_constraint con
   where con.contype = 'f' and con.connamespace = 'public'::regnamespace
     and con.confrelid::regclass::text !~ '^auth\.' and con.confrelid <> 'public.weddings'::regclass
     and cardinality(con.conkey) < 2),
  '{}'::text[], 'no single-column FK to a wedding-scoped parent');

-- 20-21. Every wedding-scoped table has wedding_id NOT NULL and a way to partition rows.
select is(
  (select coalesce(array_agg(t.name order by t.name collate "C"), '{}') from qa_tables t
   where t.name <> 'audit_log'  -- audit_log.wedding_id is nullable on purpose: system events carry none
     and not exists (select 1 from pg_attribute a where a.attrelid = ('public.' || quote_ident(t.name))::regclass
     and a.attname = case t.name when 'heartbeats' then 'source' when 'weddings' then 'id' else 'wedding_id' end
     and a.attnotnull)),
  '{}'::text[], 'every table has its tenant key NOT NULL (wedding_id; weddings: id; heartbeats: system table; audit_log excepted)');
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname::text collate "C"), '{}')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm', 'f')),
  '{}'::text[], 'no view, materialized view or foreign table in public (they bypass RLS)');

-- 22-27. FUNCTIONS: EXECUTE per class.
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname::text collate "C"), '{}')
   from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[], 'anon can execute no function in public');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname::text collate "C"), '{}')
   from pg_proc p join qa_functions f on f.name = p.proname::text
   where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'execute') is distinct from (f.klass = 'user')),
  '{}'::text[], 'authenticated can execute exactly the functions classed "user"; service-class ones are refused');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname::text collate "C"), '{}')
   from pg_proc p join qa_functions f on f.name = p.proname::text
   where p.pronamespace = 'public'::regnamespace and not has_function_privilege('service_role', p.oid, 'execute')),
  '{}'::text[], 'the secret key (service_role) can execute every function');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname::text collate "C"), '{}')
   from pg_proc p where p.pronamespace = 'public'::regnamespace
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  '{}'::text[], 'no function relies on the default PUBLIC EXECUTE (explicit ACL, nothing granted to PUBLIC)');
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname collate "C"), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  '{}'::text[], 'every SECURITY DEFINER function pins search_path');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname::text collate "C"), '{}')
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('record_account_event', 'record_event')),
  '{}'::text[], 'record_account_event is not an API function any more (REV-3): account events come only from the authorizing RPCs');

-- 28-30. The private schema is invisible to API roles.
select is(
  (select coalesce(array_agg(r order by r), '{}') from unnest(array['anon', 'authenticated']) r
   where has_schema_privilege(r, 'private', 'usage') or has_schema_privilege(r, 'private', 'create')),
  '{}'::text[], 'anon/authenticated have no USAGE or CREATE on schema private');
select is(
  (select coalesce(array_agg(c.relname::text || ':' || r order by c.relname::text, r), '{}')
   from pg_class c cross join unnest(array['anon', 'authenticated']) r
   where c.relnamespace = 'private'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
     and (has_table_privilege(r, c.oid, 'select') or has_table_privilege(r, c.oid, 'insert')
       or has_table_privilege(r, c.oid, 'update') or has_table_privilege(r, c.oid, 'delete'))),
  '{}'::text[], 'no private table/sequence is reachable by API roles (login_attempts, role_permissions)');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname::text), '{}')
   from pg_proc p cross join unnest(array['anon', 'authenticated']) r
   where p.pronamespace = 'private'::regnamespace and has_function_privilege(r, p.oid, 'execute')),
  '{}'::text[], 'no private function is executable by API roles');

-- 31. token_hash is never selectable and never in the audit trail's schema-level exclusions.
select is(
  (select count(*)::int from pg_attribute a where a.attrelid = 'public.invitations'::regclass and a.attname = 'token_hash'
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'select')),
  0, 'authenticated cannot SELECT invitations.token_hash');

-- 32. A hard DELETE is only ever allowed on soft-deleted rows, with its own permission (ADR-0002).
select is(
  (select coalesce(array_agg(t.name order by t.name collate "C"), '{}') from qa_tables t
   where t.del_soft is distinct from exists (
       select 1 from pg_policy p where p.polrelid = ('public.' || quote_ident(t.name))::regclass and p.polcmd = 'd'
         and pg_get_expr(p.polqual, p.polrelid) like '%deleted_at IS NOT NULL%'
         and pg_get_expr(p.polqual, p.polrelid) like '%has_permission(%''delete''%')
     and t.del),
  '{}'::text[], 'DELETE policy of the soft-delete tables requires deleted_at is not null AND the guests/delete permission');

select * from finish();
rollback;
