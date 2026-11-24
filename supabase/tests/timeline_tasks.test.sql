-- T8: tasks write matrix (§3.1), triggers due_overridden / completed_* / deleted_by, immutable template
-- fields, insert_template_tasks, suggestion dismissals and isolation.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(38);

select * from tests.make_wedding('tt1') \gset w1_
select * from tests.make_wedding('tt2') \gset w2_
select private.ensure_decisions(:'w1_wedding'::uuid);
select id as dd from public.decisions where wedding_id = :'w1_wedding'::uuid and key = 'date' \gset
select private.rome_today() + 300 as ref \gset
insert into public.decision_options (decision_id, wedding_id, title) values (:'dd', :'w1_wedding', 'Ref') returning id as o1 \gset
insert into public.date_scenarios (option_id, wedding_id, kind, date_from) values (:'o1', :'w1_wedding', 'fixed', :'ref');

select tests.login(:'w1_founder'::uuid);

-- insert_template_tasks
select is(public.insert_template_tasks(jsonb_build_array(
  jsonb_build_object('template_key', 'scegli-catering', 'template_version', 1, 'title', 'Scegliere il catering', 'category', 'catering', 'advice', 'Consiglio', 'offset', jsonb_build_object('months', 3, 'weeks', 2)),
  jsonb_build_object('template_key', 'scegli-il-rito', 'template_version', 1, 'title', 'Scegli il rito', 'offset', null)
)) ->> 'inserted', '2', 'two template tasks inserted');
select is((select due_date from public.tasks where template_key = 'scegli-catering'),
  ((:'ref'::date - make_interval(months => 3))::date - 14), 'due date from the current reference, months first then weeks');
select is((select template_offset::text from public.tasks where template_key = 'scegli-catering'), '{"weeks": 2, "months": 3}', 'offset stored on the task');
select is((select due_date from public.tasks where template_key = 'scegli-il-rito'), null, 'independent task has no date');
select is(public.insert_template_tasks(jsonb_build_array(
  jsonb_build_object('template_key', 'scegli-catering', 'template_version', 1, 'title', 'Scegliere il catering', 'offset', null)
)) ->> 'inserted', '0', 'an existing template key is skipped');
select throws_ok($$select public.insert_template_tasks('[{"title": "x"}]'::jsonb)$$, 'P0001', 'invalid_task', 'malformed element refused');
select throws_ok($$select public.insert_template_tasks('{"a": 1}'::jsonb)$$, 'P0001', 'invalid_tasks', 'not an array refused');
select throws_ok($$select public.insert_template_tasks('[{"template_key": "x-y", "template_version": 1, "title": "t", "offset": {"hours": 3}}]'::jsonb)$$,
  'P0001', 'invalid_task', 'unknown offset unit refused');

-- a deleted template task is never regenerated
select id as t_cat from public.tasks where template_key = 'scegli-catering' \gset
update public.tasks set deleted_at = now() where id = :'t_cat'::uuid;
select is((select deleted_by from public.tasks where id = :'t_cat'::uuid), :'w1_founder'::uuid, 'deleted_by stamped by trigger');
select isnt((select deleted_at from public.tasks where id = :'t_cat'::uuid), null, 'deleted_at set');
select is(public.insert_template_tasks(jsonb_build_array(
  jsonb_build_object('template_key', 'scegli-catering', 'template_version', 1, 'title', 'again', 'offset', null)
)) -> 'skipped_keys' ->> 0, 'scegli-catering', 'a deleted template task is not regenerated');
update public.tasks set deleted_at = null where id = :'t_cat'::uuid;
select is((select deleted_by from public.tasks where id = :'t_cat'::uuid), null, 'restoring clears deleted_by');

-- due_overridden
select is((select due_overridden from public.tasks where id = :'t_cat'::uuid), false, 'not overridden yet');
update public.tasks set due_date = :'ref'::date + 5 where id = :'t_cat'::uuid;
select is((select due_overridden from public.tasks where id = :'t_cat'::uuid), true, 'a direct due_date change sets due_overridden');
select is((select version from public.tasks where id = :'t_cat'::uuid), 4, 'version bumped on every update');

-- completed_*
update public.tasks set status = 'done' where id = :'t_cat'::uuid;
select is((select completed_by from public.tasks where id = :'t_cat'::uuid), :'w1_founder'::uuid, 'completed_by stamped');
select isnt((select completed_at from public.tasks where id = :'t_cat'::uuid), null, 'completed_at stamped');
update public.tasks set status = 'todo' where id = :'t_cat'::uuid;
select is((select completed_at from public.tasks where id = :'t_cat'::uuid), null, 'reopening clears completed_at');

-- user task
select lives_ok(format($$insert into public.tasks (wedding_id, title, notes, assignee, due_date) values (%L, 'Prenotare il parcheggio', 'n', 'A', %L)$$,
  :'w1_wedding', :'ref'::date + 1), 'user task inserted');
select is((select source || ':' || reminders_enabled::text || ':' || due_overridden::text from public.tasks where title = 'Prenotare il parcheggio'),
  'user:true:false', 'source user, reminders on by default');

-- forbidden direct writes
select throws_ok(format($$insert into public.tasks (wedding_id, title, source) values (%L, 'x', 'template')$$, :'w1_wedding'), '42501', null, 'cannot insert source');
select throws_ok(format($$insert into public.tasks (wedding_id, title, template_key) values (%L, 'x', 'abc')$$, :'w1_wedding'), '42501', null, 'cannot insert template_key');
select throws_ok($$update public.tasks set needs_review = true$$, '42501', null, 'needs_review is RPC-only');
select throws_ok($$update public.tasks set due_overridden = false$$, '42501', null, 'due_overridden is not writable');
select throws_ok($$update public.tasks set completed_by = gen_random_uuid()$$, '42501', null, 'completed_by is not writable');
select throws_ok($$update public.tasks set template_key = 'hack'$$, '42501', null, 'template fields are not writable');
select throws_ok($$update public.tasks set status = 'doing'$$, '23514', null, 'status check');
select throws_ok($$delete from public.tasks$$, '42501', null, 'no DELETE on tasks');
:su
select throws_ok(format($$update public.tasks set template_key = 'hack' where id = %L$$, :'t_cat'), '23000', null, 'template fields immutable even for the owner (guard_row)');
select is((select count(*)::int from public.audit_log where table_name = 'tasks' and wedding_id = :'w1_wedding'::uuid and op = 'UPDATE'), 5, 'task updates are audited');

-- dismissals
select tests.login(:'w1_founder'::uuid);
select lives_ok(format($$insert into public.task_suggestion_dismissals (wedding_id, template_key, kind) values (%L, 'corso-prematrimoniale', 'add')$$, :'w1_wedding'), 'dismiss an addition');
select lives_ok(format($$insert into public.task_suggestion_dismissals (wedding_id, template_key, kind) values (%L, 'corso-prematrimoniale', 'remove')$$, :'w1_wedding'), 'same key, other kind');
select throws_ok(format($$insert into public.task_suggestion_dismissals (wedding_id, template_key, kind) values (%L, 'corso-prematrimoniale', 'add')$$, :'w1_wedding'), '23505', null, 'no duplicate dismissal');
select throws_ok(format($$insert into public.task_suggestion_dismissals (wedding_id, template_key, kind) values (%L, 'x-y', 'ignore')$$, :'w1_wedding'), '23514', null, 'kind is add or remove');
select throws_ok($$delete from public.task_suggestion_dismissals$$, '42501', null, 'dismissals cannot be deleted');
:su

-- isolation
select tests.login(:'w2_founder'::uuid);
select is((select count(*)::int from public.tasks) + (select count(*)::int from public.task_suggestion_dismissals), 0, 'foreign wedding sees no tasks');
select throws_ok(format($$insert into public.tasks (wedding_id, title) values (%L, 'x')$$, :'w1_wedding'), '42501', null, 'cannot insert into a foreign wedding');
select throws_ok(format($$select public.acknowledge_task_review(%L)$$, :'t_cat'), '42501', null, 'cannot acknowledge a foreign task');
:su

select * from finish();
rollback;
