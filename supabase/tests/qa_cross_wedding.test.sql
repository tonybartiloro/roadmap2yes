-- QA (T17a): cross-wedding isolation and forbidden direct writes, GENERATED per table (psql \gexec)
-- from the oracle below, which qa_catalog_matrix.test.sql proves equal to the catalog. Covers, for
-- EVERY table of public: SELECT / INSERT / UPDATE / DELETE across two weddings, moving a row with a
-- changed wedding_id, children pointing at another wedding's parent, a `family` member without
-- permissions reading nothing, the forbidden direct writes of plan 3.1, and token_hash absent from
-- audit_log. All emails are FAKE (@example.test).
--
-- Actors: W1 founder (member of W1), W2 founder (outsider for W1), stranger (no membership at all),
-- family (member of W1 with role `family`, which has NO rows in private.role_permissions).
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(313);  -- generated per table: adding a table to the oracle changes this number (and must)

-- Oracle (see qa_catalog_matrix.test.sql for the full grant matrix).
create temp table qx_t (
  name text primary key, keycol text not null, anycol text not null, sel boolean not null,
  upd_col text, del boolean not null default false, ins_sql text, parent text
);
insert into qx_t (name, keycol, anycol, sel, upd_col, del, ins_sql, parent) values
  ('weddings', 'id', 'id', true, 'comune', false, null, null),
  ('wedding_partners', 'wedding_id', 'wedding_id', true, 'label', false, null, null),
  ('memberships', 'wedding_id', 'wedding_id', true, null, false, null, null),
  ('user_wedding_state', 'wedding_id', 'wedding_id', true, null, false, null, null),
  ('account_events', 'wedding_id', 'wedding_id', true, null, false, null, null),
  ('invitations', 'wedding_id', 'wedding_id', true, null, false, null, null),
  ('audit_log', 'wedding_id', 'wedding_id', true, null, false, null, null),
  ('heartbeats', 'source', 'source', false, null, false, null, null),
  ('notification_log', 'wedding_id', 'wedding_id', false, null, false, null, null),
  ('decisions', 'wedding_id', 'wedding_id', true, 'question', false, null, null),
  ('decision_options', 'wedding_id', 'wedding_id', true, 'title', false,
    $q$insert into public.decision_options (decision_id, wedding_id, title) values (%2$L, %1$L, 'Extra')$q$, 'decision'),
  ('date_scenarios', 'wedding_id', 'wedding_id', true, 'kind', false,
    $q$insert into public.date_scenarios (option_id, wedding_id, kind, date_from) values (%2$L, %1$L, 'fixed', '2031-06-01')$q$, 'option_free'),
  ('decision_events', 'wedding_id', 'wedding_id', true, null, false, null, null),
  ('option_reactions', 'wedding_id', 'wedding_id', true, 'reaction', true,
    $q$insert into public.option_reactions (option_id, wedding_id, user_id, reaction) values (%2$L, %1$L, auth.uid(), 'doubt')$q$, 'option_free'),
  ('task_suggestion_dismissals', 'wedding_id', 'wedding_id', true, null, false,
    $q$insert into public.task_suggestion_dismissals (wedding_id, template_key, kind) values (%1$L, 'zzz-extra', 'add')$q$, null),
  ('tasks', 'wedding_id', 'wedding_id', true, 'title', false,
    $q$insert into public.tasks (wedding_id, title) values (%1$L, 'Extra')$q$, null),
  ('budget_versions', 'wedding_id', 'wedding_id', true, null, false,
    $q$insert into public.budget_versions (wedding_id, total_cents) values (%1$L, 1)$q$, null),
  ('budget_categories', 'wedding_id', 'wedding_id', true, 'name', false,
    $q$insert into public.budget_categories (wedding_id, name) values (%1$L, 'Extra')$q$, null),
  ('budget_items', 'wedding_id', 'wedding_id', true, 'description', false,
    $q$insert into public.budget_items (wedding_id, category_id, description) values (%1$L, %2$L, 'Extra')$q$, 'category'),
  ('payments', 'wedding_id', 'wedding_id', true, 'kind', false,
    $q$insert into public.payments (wedding_id, item_id, amount_cents) values (%1$L, %2$L, 1)$q$, 'item'),
  ('notification_preferences', 'wedding_id', 'wedding_id', true, 'digest_enabled', false,
    $q$insert into public.notification_preferences (user_id, wedding_id) values (auth.uid(), %1$L) on conflict do nothing$q$, null);
-- column "upd_col" is a granted column; the update below assigns it to itself.
create temp table qx_ids (wedding uuid, kind text, id uuid);
grant select on qx_t, qx_ids to public;
-- rows touched by a statement (a data-modifying CTE cannot sit inside a function argument)
create function tests.qx_rows(p_sql text) returns int language plpgsql as
  $$ declare n int; begin execute p_sql; get diagnostics n = row_count; return n; end $$;
grant usage on schema tests to public;

-- the oracle must cover the catalog (same completeness rule as the matrix file)
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname::text), '{}') from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and c.relname::text not in (select name from qx_t)),
  '{}'::text[], 'qx oracle covers every table of public');

-- ---------------------------------------------------------------------------------------------
-- Fixtures: three weddings fully populated, one row in EVERY table (as the real RPCs/owner would).
-- ---------------------------------------------------------------------------------------------
create function pg_temp.qx_fill(p_founder uuid, p_wedding uuid, p_invite text) returns void language plpgsql as $$
declare
  v_date text := (private.rome_today() + 200)::text;  -- computed as the owner, before switching role
begin
  perform tests.login(p_founder);
  perform public.complete_onboarding(
    jsonb_build_array(jsonb_build_object('kind', 'fixed', 'date_from', v_date, 'label', 'Settembre')),
    jsonb_build_array(jsonb_build_object('template_key', 'scegli-data-e-location', 'template_version', 1, 'title', 'Scegliere data e location', 'offset', null)));
  perform public.record_seen();
  perform public.authorize_account_op('change_own_code', null, null);
  if p_invite is not null then
    perform public.upsert_partner_b(p_invite);
    perform public.create_invitation(p_invite, 'email', null, decode(repeat('ab', 32), 'hex'));
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.decision_options (decision_id, wedding_id, title)
    select d.id, p_wedding, 'Villa Esempio' from public.decisions d where d.wedding_id = p_wedding and d.key = 'location';
  insert into public.decision_options (decision_id, wedding_id, title)
    select d.id, p_wedding, 'Libera' from public.decisions d where d.wedding_id = p_wedding and d.key = 'date';
  update public.date_scenarios set location_option_id = (select id from public.decision_options where wedding_id = p_wedding and title = 'Villa Esempio')
    where wedding_id = p_wedding;
  insert into public.budget_versions (wedding_id, total_cents) values (p_wedding, 1000000);
  insert into public.budget_categories (wedding_id, name, assigned_cents) values (p_wedding, 'Location', 500000);
  insert into public.budget_items (wedding_id, category_id, description, planned_cents)
    select p_wedding, id, 'Villa', 400000 from public.budget_categories where wedding_id = p_wedding;
  insert into public.payments (wedding_id, item_id, kind, amount_cents)
    select p_wedding, id, 'deposit', 100000 from public.budget_items where wedding_id = p_wedding;
  insert into public.option_reactions (option_id, wedding_id, user_id, reaction)
    select id, p_wedding, p_founder, 'prefer' from public.decision_options where wedding_id = p_wedding and title = 'Villa Esempio';
  insert into public.notification_preferences (user_id, wedding_id) values (p_founder, p_wedding);
  insert into public.task_suggestion_dismissals (wedding_id, template_key, kind) values (p_wedding, 'scegli-catering', 'add');
  insert into public.notification_log (wedding_id, user_id, kind, batch_key, status, sent_at, claimed_at)
    values (p_wedding, p_founder, 'reminder', 'qx-' || p_wedding, 'sent', now(), now());
  insert into qx_ids
    select p_wedding, 'decision', id from public.decisions where wedding_id = p_wedding and key = 'date'
    union all select p_wedding, 'option_free', id from public.decision_options where wedding_id = p_wedding and title = 'Libera'
    union all select p_wedding, 'option_loc', id from public.decision_options where wedding_id = p_wedding and title = 'Villa Esempio'
    union all select p_wedding, 'category', id from public.budget_categories where wedding_id = p_wedding
    union all select p_wedding, 'item', id from public.budget_items where wedding_id = p_wedding
    union all select p_wedding, 'task', id from public.tasks where wedding_id = p_wedding limit 100;
end;
$$;

select * from tests.make_wedding('qx1') \gset w1_
select * from tests.make_wedding('qx2') \gset w2_
select * from tests.make_wedding('qx3') \gset w3_
select tests.make_user('qx.stranger@example.test') as stranger \gset
select tests.make_user('qx1.family@example.test') as fam \gset
select tests.make_user('qx3.b@example.test') as w3b \gset
insert into public.memberships (wedding_id, user_id, role) values (:'w1_wedding'::uuid, :'fam'::uuid, 'family');
insert into public.wedding_partners (wedding_id, slot, email, user_id) values (:'w3_wedding'::uuid, 'B', 'qx3.b@example.test', :'w3b'::uuid);
insert into public.memberships (wedding_id, user_id, role, partner_slot) values (:'w3_wedding'::uuid, :'w3b'::uuid, 'partner', 'B');
select pg_temp.qx_fill(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'qx1.invitee@example.test');
select pg_temp.qx_fill(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'qx2.invitee@example.test');
select pg_temp.qx_fill(:'w3_founder'::uuid, :'w3_wedding'::uuid, null);
insert into public.option_reactions (option_id, wedding_id, user_id, reaction)
  select id, wedding, :'w3b'::uuid, 'doubt' from qx_ids where wedding = :'w3_wedding'::uuid and kind = 'option_loc';
insert into public.heartbeats (source) values ('qx');
select id as w1_task from qx_ids where wedding = :'w1_wedding'::uuid and kind = 'task' limit 1 \gset

-- ===== A. The fixtures are not vacuous: the founder sees rows in every readable table. =========
select tests.login(:'w1_founder'::uuid);
select format($$select cmp_ok((select count(*)::int from public.%I where %I = %L), '>', 0, %L)$$,
  t.name, t.keycol, :'w1_wedding', 'fixture: W1 founder sees rows in ' || t.name)
from qx_t t where t.sel order by t.name \gexec
:su

-- ===== B. Cross-wedding SELECT: outsider, stranger and family see nothing of W1. =================
select tests.login(:'w2_founder'::uuid);
select format($$select is((select count(*)::int from public.%I where %I = %L), 0, %L)$$,
  t.name, t.keycol, :'w1_wedding', 'member of W2 reads no ' || t.name || ' of W1')
from qx_t t where t.sel order by t.name \gexec
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('select count(*) from public.%I', t.name), 'no SELECT on service table ' || t.name)
from qx_t t where not t.sel order by t.name \gexec
:su
select tests.login(:'stranger'::uuid);
select format($$select is((select count(*)::int from public.%I where %I = %L), 0, %L)$$,
  t.name, t.keycol, :'w1_wedding', 'user with no membership reads no ' || t.name)
from qx_t t where t.sel order by t.name \gexec
:su
select tests.login(:'fam'::uuid);
select format($$select is((select count(*)::int from public.%I where %I = %L), 0, %L)$$,
  t.name, t.keycol, :'w1_wedding', 'family member without permissions reads no ' || t.name)
from qx_t t where t.sel order by t.name \gexec
:su

-- ===== C. Cross-wedding UPDATE (granted column) touches nothing; ungranted tables refuse. ========
select tests.login(:'w2_founder'::uuid);
select format($$select is(tests.qx_rows(%6$L), 0, %5$L)$$,
  t.name, t.upd_col, t.keycol, :'w1_wedding', 'member of W2 updates 0 rows of ' || t.name || ' in W1',
  format('update public.%1$I set %2$I = %2$I where %3$I = %4$L', t.name, t.upd_col, t.keycol, :'w1_wedding'))
from qx_t t where t.upd_col is not null order by t.name \gexec
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('update public.%1$I set %2$I = %2$I where %3$I = %4$L', t.name, t.anycol, t.keycol, :'w1_wedding'),
  'no UPDATE on ' || t.name || ' at all')
from qx_t t where t.upd_col is null order by t.name \gexec
:su
select tests.login(:'fam'::uuid);
select format($$select is(tests.qx_rows(%6$L), 0, %5$L)$$,
  t.name, t.upd_col, t.keycol, :'w1_wedding', 'family member without permissions updates 0 rows of ' || t.name,
  format('update public.%1$I set %2$I = %2$I where %3$I = %4$L', t.name, t.upd_col, t.keycol, :'w1_wedding'))
from qx_t t where t.upd_col is not null order by t.name \gexec
:su

-- ===== D. DELETE: never allowed (own wedding included), except own reactions. ================
select tests.login(:'w2_founder'::uuid);
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('delete from public.%I where %I = %L', t.name, t.keycol, :'w1_wedding'), 'outsider: no DELETE on ' || t.name)
from qx_t t where not t.del order by t.name \gexec
select is(tests.qx_rows(format('delete from public.option_reactions where wedding_id = %L', :'w1_wedding')),
  0, 'outsider deletes 0 reactions of another wedding');
:su
select tests.login(:'w1_founder'::uuid);
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('delete from public.%I where %I = %L', t.name, t.keycol, :'w1_wedding'), 'own wedding: no hard DELETE on ' || t.name)
from qx_t t where not t.del order by t.name \gexec
:su

-- ===== E. Cross-wedding INSERT. ================================================================
select tests.login(:'w2_founder'::uuid);
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('insert into public.%1$I (%2$I) values (null)', t.name, t.anycol), 'no INSERT on ' || t.name || ' at all')
from qx_t t where t.ins_sql is null order by t.name \gexec
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format(t.ins_sql, :'w1_wedding', (select i.id from qx_ids i where i.wedding = :'w1_wedding'::uuid and i.kind = t.parent)),
  'member of W2 cannot INSERT into ' || t.name || ' of W1')
from qx_t t where t.ins_sql is not null order by t.name \gexec
:su
select tests.login(:'fam'::uuid);
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format(t.ins_sql, :'w1_wedding', (select i.id from qx_ids i where i.wedding = :'w1_wedding'::uuid and i.kind = t.parent)),
  'family member without permissions cannot INSERT into ' || t.name)
from qx_t t where t.ins_sql is not null order by t.name \gexec
:su
select tests.login(:'w1_founder'::uuid);
-- own wedding, valid parents: the payload is valid (so the refusals above are about the wedding, not the payload)
select format($$select lives_ok(%L, %L)$$,
  format(t.ins_sql, :'w1_wedding', (select i.id from qx_ids i where i.wedding = :'w1_wedding'::uuid and i.kind = t.parent)),
  'sanity: W1 founder CAN insert the same row into ' || t.name || ' of W1')
from qx_t t where t.ins_sql is not null order by t.name \gexec
-- naming another wedding in the row
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format(t.ins_sql, :'w2_wedding', (select i.id from qx_ids i where i.wedding = :'w2_wedding'::uuid and i.kind = t.parent)),
  'W1 founder cannot INSERT into ' || t.name || ' naming wedding W2')
from qx_t t where t.ins_sql is not null order by t.name \gexec
-- child of ANOTHER wedding's parent: composite FK (23503); date_scenarios' own trigger answers first (P0001)
select format($$select throws_ok(%L, %L, null, %L)$$,
  format(t.ins_sql, :'w1_wedding', (select i.id from qx_ids i where i.wedding = :'w2_wedding'::uuid and i.kind = t.parent)),
  case t.name when 'date_scenarios' then 'P0001' else '23503' end,
  t.name || ': a row of W1 cannot hang from a parent of W2')
from qx_t t where t.parent is not null order by t.name \gexec
select throws_ok(
  format($q$update public.date_scenarios set location_option_id = %L where wedding_id = %L$q$,
    (select id from qx_ids where wedding = :'w2_wedding'::uuid and kind = 'option_loc'), :'w1_wedding'),
  'P0001', 'invalid_location', 'a date of W1 cannot link a location option of W2');
:su

-- ===== F. Moving a row to another wedding (wedding_id / id change). ============================
select tests.login(:'w1_founder'::uuid);
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('update public.%1$I set %2$I = %3$L where %2$I = %4$L', t.name, t.keycol, :'w2_wedding', :'w1_wedding'),
  'cannot change ' || t.name || '.' || t.keycol || ' (no column grant: a row never moves between weddings)')
from qx_t t order by t.name \gexec
:su

-- ===== G. Forbidden direct writes inside the OWN wedding (plan 3.1). ===========================
select tests.login(:'w1_founder'::uuid);
-- version and created_by are never writable, on any table that has them and lets users update
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('update public.%I set version = 99 where %I = %L', t.name, t.keycol, :'w1_wedding'), t.name || ': version is not writable')
from qx_t t where t.upd_col is not null and exists (select 1 from pg_attribute a where a.attrelid = ('public.' || t.name)::regclass and a.attname = 'version')
order by t.name \gexec
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('update public.%I set created_by = null where %I = %L', t.name, t.keycol, :'w1_wedding'), t.name || ': created_by is not writable')
from qx_t t where t.upd_col is not null and exists (select 1 from pg_attribute a where a.attrelid = ('public.' || t.name)::regclass and a.attname = 'created_by')
order by t.name \gexec

select throws_ok($$update public.decision_options set status = 'chosen'$$, '42501', null, 'decision_options.status only through choose_option/reopen_decision');
select throws_ok($$update public.decisions set status = 'taken'$$, '42501', null, 'decisions.status only through the RPCs');
select throws_ok($$update public.decisions set chosen_option_id = null$$, '42501', null, 'decisions.chosen_option_id only through the RPCs');
select throws_ok(format($$insert into public.decision_events (decision_id, wedding_id, kind) values (%L, %L, 'note')$$,
  (select id from qx_ids where wedding = :'w1_wedding'::uuid and kind = 'decision'), :'w1_wedding'), '42501', null, 'decision_events: no direct INSERT');
select throws_ok($$update public.decision_events set reason = 'x'$$, '42501', null, 'decision_events: no direct UPDATE');
select throws_ok(format($$insert into public.memberships (wedding_id, user_id, role, partner_slot) values (%L, %L, 'partner', 'B')$$,
  :'w1_wedding', :'stranger'), '42501', null, 'memberships: no direct INSERT (a user cannot add themselves or anyone)');
select throws_ok($$update public.memberships set role = 'planner'$$, '42501', null, 'memberships: no direct UPDATE');
select throws_ok(format($$insert into public.account_events (wedding_id, kind, actor_id) values (%L, 'temp_code_set', %L)$$,
  :'w1_wedding', :'w1_founder'), '42501', null, 'account_events: no forged event');
select throws_ok(format($$insert into public.invitations (wedding_id, email, method) values (%L, 'x@example.test', 'code')$$, :'w1_wedding'),
  '42501', null, 'invitations: no direct INSERT');
select throws_ok($$update public.invitations set accepted_at = now()$$, '42501', null, 'invitations: no direct UPDATE');
select throws_ok($$select token_hash from public.invitations$$, '42501', null, 'invitations.token_hash is not selectable');
select throws_ok($$select * from public.invitations$$, '42501', null, 'select * on invitations is refused (token_hash)');
select throws_ok($$update public.wedding_partners set email = 'someone.else@example.test'$$, '42501', null, 'wedding_partners.email only through update_partner_email/sync_my_email');
select throws_ok(format($$update public.wedding_partners set user_id = %L$$, :'stranger'), '42501', null, 'wedding_partners.user_id only through accept_pending_invitation');
select throws_ok($$update public.weddings set applied_reference_date = '2030-01-01'$$, '42501', null, 'weddings.applied_reference_date only through the reference RPCs');
select throws_ok($$update public.weddings set onboarding_completed_at = now()$$, '42501', null, 'weddings.onboarding_completed_at only through complete_onboarding');
select throws_ok($$update public.weddings set manual_reference_option_id = null$$, '42501', null, 'weddings.manual_reference_option_id only through set_reference_scenario');
select throws_ok($$update public.budget_versions set total_cents = 1$$, '42501', null, 'budget_versions are append-only (no UPDATE)');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'audit_log: no DELETE for users');

-- tasks: system columns (source, template_*, needs_review, completed_*, due_overridden, deleted_by)
select format($$select throws_ok(%L, '42501', null, %L)$$,
  format('update public.tasks set %s where wedding_id = %L', c.assignment, :'w1_wedding'), 'tasks.' || c.col || ' is not directly writable')
from (values ('source', $a$source = 'user'$a$), ('template_key', $a$template_key = 'x'$a$), ('template_version', 'template_version = 9'),
  ('template_offset', $a$template_offset = null$a$), ('needs_review', 'needs_review = true'), ('completed_at', 'completed_at = now()'),
  ('completed_by', 'completed_by = null'), ('due_overridden', 'due_overridden = true'), ('deleted_by', 'deleted_by = null')) as c(col, assignment) \gexec
select throws_ok(format($$insert into public.tasks (wedding_id, title, source) values (%L, 'T', 'template')$$, :'w1_wedding'),
  '42501', null, 'tasks: a user cannot INSERT a template-sourced task');
select throws_ok(format($$insert into public.tasks (wedding_id, title, needs_review) values (%L, 'T', true)$$, :'w1_wedding'),
  '42501', null, 'tasks: a user cannot INSERT needs_review');
select throws_ok(format($$insert into public.decision_options (decision_id, wedding_id, title, status) values (%L, %L, 'T', 'chosen')$$,
  (select id from qx_ids where wedding = :'w1_wedding'::uuid and kind = 'decision'), :'w1_wedding'), '42501', null,
  'decision_options: a user cannot INSERT a status');

-- tasks: the allowed writes and their triggers (due_date without due_overridden is stamped by the DB)
select lives_ok(format($$update public.tasks set due_date = '2031-01-15' where id = %L$$, :'w1_task'), 'tasks.due_date is directly writable');
select is((select due_overridden from public.tasks where id = :'w1_task'::uuid), true, 'tasks: editing due_date stamps due_overridden (the trigger, not the client)');
select lives_ok(format($$update public.tasks set status = 'done' where id = %L$$, :'w1_task'), 'tasks.status is directly writable');
select is((select completed_by from public.tasks where id = :'w1_task'::uuid), :'w1_founder'::uuid, 'tasks: completed_by stamped with the caller by the trigger');
select isnt((select completed_at from public.tasks where id = :'w1_task'::uuid), null, 'tasks: completed_at stamped by the trigger');
select lives_ok(format($$update public.tasks set deleted_at = now() where id = %L$$, :'w1_task'), 'tasks.deleted_at is directly writable (soft delete)');
select is((select deleted_by from public.tasks where id = :'w1_task'::uuid), :'w1_founder'::uuid, 'tasks: deleted_by stamped with the caller by the trigger');

-- reactions: only the caller's own rows
select throws_ok($$update public.option_reactions set user_id = user_id$$, '42501', null, 'option_reactions.user_id is not updatable');
:su
select tests.login(:'w3_founder'::uuid);
select throws_ok(format($$insert into public.option_reactions (option_id, wedding_id, user_id, reaction) values (%L, %L, %L, 'prefer')$$,
  (select id from qx_ids where wedding = :'w3_wedding'::uuid and kind = 'option_free'), :'w3_wedding', :'w3b'), '42501', null,
  'a partner cannot react in the name of the other partner');
select is(tests.qx_rows(format('update public.option_reactions set reaction = ''prefer'' where user_id = %L', :'w3b')),
  0, 'a partner cannot change the other partner''s reaction');
select is(tests.qx_rows(format('delete from public.option_reactions where user_id = %L', :'w3b')),
  0, 'a partner cannot delete the other partner''s reaction');
select is((select count(*)::int from public.user_wedding_state where user_id <> :'w3_founder'::uuid), 0, 'user_wedding_state: only own rows');
:su
select tests.login(:'w3b'::uuid);
select is((select count(*)::int from public.user_wedding_state where user_id = :'w3_founder'::uuid), 0, 'partner B does not read A''s user_wedding_state');
select is((select count(*)::int from public.notification_preferences where user_id = :'w3_founder'::uuid), 0, 'partner B does not read A''s notification_preferences');
select is((select count(*)::int from public.option_reactions where user_id = :'w3_founder'::uuid), 1, 'partner B reads A''s reactions (shared decisions)');
:su

-- ===== H. A family member (no permissions) cannot use the partner RPCs either. ===============
select tests.login(:'fam'::uuid);
select throws_ok($$select public.create_invitation('qx.x@example.test', 'code')$$, null, null, 'family: create_invitation refused');
select throws_ok($$select public.upsert_partner_b('qx.x@example.test')$$, null, null, 'family: upsert_partner_b refused');
select throws_ok(format($$select public.complete_onboarding()$$), null, null, 'family: complete_onboarding refused');
select is((public.authorize_account_op('set_temp_code', 'B', null))->>'error', 'not_partner', 'family: authorize_account_op answers not_partner (no target returned)');
select is((public.authorize_account_op('change_own_code'))->>'allowed', 'false', 'family: cannot even authorize an own code change');
:su
select is((select count(*)::int from public.account_events where actor_id = :'fam'::uuid), 0, 'family: no account event was written');

-- ===== I. Append-only tables also stop the secret key (service_role) and the owner. ============
select tests.login_service();
select throws_ok($$update public.decision_events set reason = 'x'$$, null, null, 'service key: decision_events UPDATE blocked');
select throws_ok($$delete from public.decision_events$$, null, null, 'service key: decision_events DELETE blocked');
select throws_ok($$update public.budget_versions set total_cents = 2$$, null, null, 'service key: budget_versions UPDATE blocked');
select throws_ok($$delete from public.budget_versions$$, null, null, 'service key: budget_versions DELETE blocked');
select throws_ok($$update public.audit_log set op = 'X'$$, null, null, 'service key: audit_log UPDATE blocked');
select throws_ok($$delete from public.audit_log$$, null, null, 'service key: audit_log DELETE blocked');
select throws_ok($$update public.account_events set kind = 'code_changed'$$, null, null, 'service key: account_events UPDATE blocked');
select throws_ok($$delete from public.account_events$$, null, null, 'service key: account_events DELETE blocked');
:su

-- ===== J. token_hash never reaches audit_log. ===================================================
select cmp_ok((select count(*)::int from public.audit_log where table_name = 'invitations'), '>', 0, 'invitations were audited (not vacuous)');
select is((select count(*)::int from public.audit_log
  where table_name = 'invitations' and (old_data::text || new_data::text) ~* 'token_hash'), 0, 'audit_log never carries the token_hash key');
select is((select count(*)::int from public.audit_log
  where (old_data::text || new_data::text) like '%' || repeat('ab', 32) || '%'), 0, 'audit_log never carries the token hash value');

select * from finish();
rollback;
