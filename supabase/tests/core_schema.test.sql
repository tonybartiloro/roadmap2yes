-- T2: structure, RLS everywhere, EXECUTE allowlist, grants, private schema.
begin;
select plan(15);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'RLS enabled on every table of public and private');

select is(
  (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('authenticated', p.oid, 'execute')),
  array[
    'accept_pending_invitation()', 'authorize_account_op(text,text)', 'create_invitation(text,text,uuid,bytea)',
    'create_wedding()', 'dismiss_welcome()', 'has_permission(uuid,text,text)', 'last_heartbeat(text)',
    'move_budget_items(uuid,uuid)', 'record_account_event(text,uuid)', 'record_export()', 'record_seen()', 'revoke_invitation(uuid)',
    'rotate_invitation(uuid,bytea)', 'sync_my_email()', 'update_partner_email(text,text)',
    'upsert_partner_b(text,text,text,text)'
  ]::text[], 'authenticated can execute exactly the allowlist (T8/T9 extend it)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')),
  0, 'anon cannot execute any public function');

select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('service_role', p.oid, 'execute')
     and not has_function_privilege('authenticated', p.oid, 'execute')),
  array['auth_user_id_by_email', 'job_claim_notification', 'job_fail_notification',
    'job_mark_notification_sent', 'job_quota_status', 'job_recipients', 'job_sent_item_keys',
    'job_unsubscribe', 'login_gate', 'login_record', 'record_heartbeat']::text[],
  'secret-key-only functions are not executable by authenticated');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.prokind = 'f'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no private function is executable by anon/authenticated');

select ok(not has_schema_privilege('authenticated', 'private', 'usage')
  and not has_schema_privilege('anon', 'private', 'usage'), 'private schema is not usable by API roles');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0, 'every SECURITY DEFINER function sets search_path');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'),
  0, 'anon has no table privileges');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'DELETE', 'TRUNCATE')),
  0, 'authenticated has no INSERT/DELETE/TRUNCATE on any table');

select is(
  (select array_agg(table_name::text order by table_name) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  null::text[], 'no table-level UPDATE (column grants only)');

select is(
  (select array_agg(table_name::text || '.' || column_name::text order by (table_name::text || '.' || column_name::text) collate "C")
   from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  array[
    'budget_categories.assigned_cents', 'budget_categories.deleted_at', 'budget_categories.name',
    'budget_categories.sort_order',
    'budget_items.agreed_cents', 'budget_items.deleted_at', 'budget_items.description',
    'budget_items.planned_cents', 'budget_items.status',
    'notification_preferences.digest_enabled', 'notification_preferences.reminders_enabled',
    'payments.amount_cents', 'payments.deleted_at', 'payments.due_date', 'payments.kind',
    'payments.paid', 'payments.paid_on',
    'wedding_partners.first_name', 'wedding_partners.label', 'wedding_partners.last_name',
    'weddings.comune', 'weddings.guest_band', 'weddings.onboarding_answers', 'weddings.onboarding_unknown',
    'weddings.region', 'weddings.rite', 'weddings.style_label', 'weddings.style_note', 'weddings.theme_id'
  ]::text[], 'column UPDATE grants match matrix 3.1 (T8/T9 extend it; sorted in C collation)');

select is(
  (select array_agg(table_name::text || '.' || column_name::text order by (table_name::text || '.' || column_name::text) collate "C")
   from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'INSERT'),
  array[
    'budget_categories.assigned_cents', 'budget_categories.default_key', 'budget_categories.name',
    'budget_categories.sort_order', 'budget_categories.wedding_id',
    'budget_items.agreed_cents', 'budget_items.category_id', 'budget_items.description',
    'budget_items.planned_cents', 'budget_items.status', 'budget_items.wedding_id',
    'budget_versions.reason', 'budget_versions.total_cents', 'budget_versions.wedding_id',
    'notification_preferences.digest_enabled', 'notification_preferences.reminders_enabled',
    'notification_preferences.user_id', 'notification_preferences.wedding_id',
    'payments.amount_cents', 'payments.due_date', 'payments.item_id', 'payments.kind',
    'payments.paid', 'payments.paid_on', 'payments.wedding_id'
  ]::text[], 'column INSERT grants match matrix 3.1 (T8/T9 extend it; sorted in C collation)');

select ok(not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'select'),
  'token_hash is not selectable');
select ok(has_column_privilege('authenticated', 'public.invitations', 'email', 'select'), 'invitation email is selectable');

select is(
  (select count(*)::int from public.has_permission('00000000-0000-0000-0000-000000000000', 'wedding', 'read') h where h),
  0, 'has_permission false for unknown wedding');

select * from finish();
rollback;
