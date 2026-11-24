-- T2: structure, RLS everywhere, EXECUTE allowlist, grants, private schema.
begin;
select plan(18);

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
    'accept_pending_invitation()', 'acknowledge_task_review(uuid)', 'add_decision_note(uuid,text,uuid)',
    'authorize_account_op(text,text,text)', 'choose_option(uuid,uuid,integer,date)', 'complete_onboarding(jsonb,jsonb)',
    'create_invitation(text,text,uuid,bytea)',
    'create_wedding()', 'dismiss_welcome()', 'has_permission(uuid,text,text)', 'insert_template_tasks(jsonb)',
    'last_heartbeat(text)',
    'move_budget_items(uuid,uuid)', 'record_export()', 'record_seen()',
    'reopen_decision(uuid,text,integer)', 'revoke_invitation(uuid)',
    'rotate_invitation(uuid,bytea)', 'set_reference_scenario(uuid)', 'sync_my_email()', 'update_partner_email(text,text)',
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
  array['auth_user_id_by_email', 'invitation_by_token', 'job_claim_notification', 'job_fail_notification',
    'job_mark_notification_sent', 'job_quota_status', 'job_recipients', 'job_sent_item_keys',
    'job_unsubscribe', 'login_gate', 'login_record', 'record_heartbeat', 'sync_timeline']::text[],
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
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'TRUNCATE')),
  0, 'authenticated has no table-level INSERT/TRUNCATE on any table');

select is(
  (select array_agg(table_name::text order by table_name) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'DELETE'),
  array['option_reactions']::text[], 'DELETE only on option_reactions (own rows, RLS)');

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
    'date_scenarios.date_from', 'date_scenarios.date_to', 'date_scenarios.kind', 'date_scenarios.location_option_id',
    'decision_options.comune', 'decision_options.cons', 'decision_options.cost_cents', 'decision_options.deleted_at',
    'decision_options.link', 'decision_options.notes', 'decision_options.pros', 'decision_options.title',
    'decisions.question',
    'notification_preferences.digest_enabled', 'notification_preferences.reminders_enabled',
    'option_reactions.reaction',
    'payments.amount_cents', 'payments.deleted_at', 'payments.due_date', 'payments.kind',
    'payments.paid', 'payments.paid_on',
    'tasks.assignee', 'tasks.category', 'tasks.deleted_at', 'tasks.due_date', 'tasks.notes',
    'tasks.reminders_enabled', 'tasks.status', 'tasks.title',
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
    'date_scenarios.date_from', 'date_scenarios.date_to', 'date_scenarios.kind',
    'date_scenarios.location_option_id', 'date_scenarios.option_id', 'date_scenarios.wedding_id',
    'decision_options.comune', 'decision_options.cons', 'decision_options.cost_cents',
    'decision_options.decision_id', 'decision_options.link', 'decision_options.notes', 'decision_options.pros',
    'decision_options.title', 'decision_options.wedding_id',
    'notification_preferences.digest_enabled', 'notification_preferences.reminders_enabled',
    'notification_preferences.user_id', 'notification_preferences.wedding_id',
    'option_reactions.option_id', 'option_reactions.reaction', 'option_reactions.user_id',
    'option_reactions.wedding_id',
    'payments.amount_cents', 'payments.due_date', 'payments.item_id', 'payments.kind',
    'payments.paid', 'payments.paid_on', 'payments.wedding_id',
    'task_suggestion_dismissals.kind', 'task_suggestion_dismissals.template_key',
    'task_suggestion_dismissals.wedding_id',
    'tasks.assignee', 'tasks.category', 'tasks.due_date', 'tasks.notes', 'tasks.reminders_enabled',
    'tasks.title', 'tasks.wedding_id'
  ]::text[], 'column INSERT grants match matrix 3.1 (T8/T9 extend it; sorted in C collation)');

select ok(not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'select'),
  'token_hash is not selectable');
select ok(has_column_privilege('authenticated', 'public.invitations', 'email', 'select'), 'invitation email is selectable');

select is(
  (select count(*)::int from public.has_permission('00000000-0000-0000-0000-000000000000', 'wedding', 'read') h where h),
  0, 'has_permission false for unknown wedding');

-- REV-3: account events cannot be declared through the API any more.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_account_event'),
  0, 'record_account_event does not exist in the exposed schema');
select ok(
  not has_function_privilege('authenticated', 'private.record_account_event(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.account_reusable(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.invitation_by_token(bytea)', 'execute'),
  'private account helpers and invitation_by_token are not executable by API roles');

select * from finish();
rollback;
