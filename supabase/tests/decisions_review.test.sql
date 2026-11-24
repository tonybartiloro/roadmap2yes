-- T8 review round 1: definitive scenario date, restore/reopen status invariants, denied paths,
-- no reference left, derived updates keep weddings.version, task cap.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(35);

select * from tests.make_wedding('rv1') \gset w1_
select * from tests.make_wedding('rv2') \gset w2_
select tests.make_user('rv1.b@example.test') as b1 \gset
select tests.make_user('rv.nomember@example.test') as nm \gset
insert into public.wedding_partners (wedding_id, slot, email, user_id) values (:'w1_wedding'::uuid, 'B', 'rv1.b@example.test', :'b1'::uuid);
insert into public.memberships (wedding_id, user_id, role, partner_slot) values (:'w1_wedding'::uuid, :'b1'::uuid, 'partner', 'B');
select private.ensure_decisions(:'w1_wedding'::uuid);
select id as dd from public.decisions where wedding_id = :'w1_wedding'::uuid and key = 'date' \gset
select id as ld from public.decisions where wedding_id = :'w1_wedding'::uuid and key = 'location' \gset
select private.rome_today() as today \gset

insert into public.decision_options (decision_id, wedding_id, title) values (:'dd', :'w1_wedding', 'D1') returning id as d1 \gset
insert into public.date_scenarios (option_id, wedding_id, kind, date_from) values (:'d1', :'w1_wedding', 'fixed', :'today'::date + 100);
insert into public.decision_options (decision_id, wedding_id, title) values (:'dd', :'w1_wedding', 'D2') returning id as d2 \gset
insert into public.date_scenarios (option_id, wedding_id, kind, date_from) values (:'d2', :'w1_wedding', 'fixed', :'today'::date + 200);
insert into public.decision_options (decision_id, wedding_id, title) values (:'ld', :'w1_wedding', 'L1') returning id as l1 \gset

select tests.login(:'w1_founder'::uuid);
select public.insert_template_tasks('[
  {"template_key":"k-a","template_version":1,"title":"A","offset":{"months":2}},
  {"template_key":"k-b","template_version":1,"title":"B","offset":{"months":2}},
  {"template_key":"k-c","template_version":1,"title":"C","offset":{"months":1}}]'::jsonb) ->> 'inserted' as ins \gset
select is(:'ins'::int, 3, 'three dependent tasks');
update public.tasks set due_date = date '2031-01-01' where template_key = 'k-b';
select id as ta from public.tasks where template_key = 'k-a' \gset
select id as tc from public.tasks where template_key = 'k-c' \gset

-- denied paths and invalid arguments ------------------------------------------------------------
select throws_ok(format($$select public.choose_option(%L, %L, null, %L)$$, :'dd', :'d1', :'today'::date + 101), 'P0001', 'exact_date_out_of_period',
  'a fixed scenario with a different exact day is refused');
select throws_ok(format($$select public.choose_option(%L, %L, null, %L)$$, :'ld', :'l1', :'today'::date + 101), 'P0001', 'exact_date_not_applicable',
  'an exact day makes no sense for a location');
select throws_ok(format($$select public.reopen_decision(%L, 'perche')$$, :'dd'), 'P0001', 'not_taken', 'reopening an open decision is refused');

-- reactions: nobody deletes the other partner's reaction
select lives_ok(format($$insert into public.option_reactions (option_id, wedding_id, user_id, reaction) values (%L, %L, %L, 'prefer')$$, :'l1', :'w1_wedding', :'w1_founder'), 'A reacts');
:su
select tests.login(:'b1'::uuid);
delete from public.option_reactions where wedding_id = :'w1_wedding'::uuid;
:su
select is((select count(*)::int from public.option_reactions where wedding_id = :'w1_wedding'::uuid), 1, 'B cannot delete the reaction of A');
select tests.login(:'w1_founder'::uuid);
delete from public.option_reactions where wedding_id = :'w1_wedding'::uuid;
:su
select is((select count(*)::int from public.option_reactions where wedding_id = :'w1_wedding'::uuid), 0, 'A can retract their own reaction');

-- derived updates do not bump weddings.version (REV-8) and do not mark tasks as overridden
select version as v0 from public.weddings where id = :'w1_wedding'::uuid \gset
select applied_reference_date as before_ref from public.weddings where id = :'w1_wedding'::uuid \gset
insert into public.decision_options (decision_id, wedding_id, title) values (:'dd', :'w1_wedding', 'D3') returning id as d3 \gset
insert into public.date_scenarios (option_id, wedding_id, kind, date_from) values (:'d3', :'w1_wedding', 'fixed', :'today'::date + 50);
select is((select applied_reference_date from public.weddings where id = :'w1_wedding'::uuid), :'today'::date + 50, 'reference moved');
select is((select version from public.weddings where id = :'w1_wedding'::uuid), :'v0'::int, 'weddings.version unchanged by a derived sync');
select is((select due_overridden from public.tasks where id = :'ta'::uuid), false, 'sync does not set due_overridden');
select is((select due_date from public.tasks where id = :'ta'::uuid), (:'today'::date + 50 - make_interval(months => 2))::date, 'but the task did follow');

-- a definitive scenario cannot move (REV-1) ---------------------------------------------------------
select tests.login(:'w1_founder'::uuid);
select public.choose_option(:'dd', :'d1') is not null as ch \gset
select throws_ok(format($$update public.date_scenarios set date_from = %L where option_id = %L$$, :'today'::date + 1, :'d1'),
  'P0001', 'decision_taken', 'the chosen scenario date cannot change');
select throws_ok(format($$update public.date_scenarios set kind = 'period', date_to = %L where option_id = %L$$, :'today'::date + 400, :'d1'),
  'P0001', 'decision_taken', 'nor its kind');
select throws_ok(format($$update public.date_scenarios set date_from = %L where option_id = %L$$, :'today'::date + 1, :'d2'),
  'P0001', 'decision_taken', 'nor a discarded scenario while the decision is taken');
select lives_ok(format($$update public.date_scenarios set location_option_id = %L where option_id = %L$$, :'l1', :'d1'),
  'the location link stays editable');
select is((select applied_reference_date from public.weddings), :'today'::date + 100, 'definitive reference untouched');

-- completing a task clears the review flag (deviation 5) --------------------------------------------
-- restore / reopen invariants (REV-2) -------------------------------------------------------------------
update public.decision_options set deleted_at = now() where id = :'d2'::uuid;
select throws_ok(format($$update public.decision_options set deleted_at = null where id = %L$$, :'d2'), 'P0001', 'decision_taken',
  'no restore of an option on a taken decision');
select lives_ok(format($$select public.reopen_decision(%L, 'ci siamo ripensati')$$, :'dd'), 'reopen');
select is((select status from public.decision_options where id = :'d2'::uuid), 'candidate', 'a deleted discarded option is a candidate after reopening');
select is((select count(*)::int from public.tasks where needs_review), 3, 'dependent tasks flagged');
update public.tasks set status = 'done' where id = :'ta'::uuid;
select is((select needs_review from public.tasks where id = :'ta'::uuid), false, 'completing a task clears needs_review');
:su
update public.decision_options set status = 'discarded' where id = :'d2'::uuid;
select tests.login(:'w1_founder'::uuid);
select lives_ok(format($$update public.decision_options set deleted_at = null where id = %L$$, :'d2'), 'restore a deleted option');
select is((select status from public.decision_options where id = :'d2'::uuid), 'candidate', 'a restored option is always a candidate');
select throws_ok(format($$select public.reopen_decision(%L, %L)$$, :'dd', repeat('x', 501)), 'P0001', 'not_taken', 'not_taken has priority over reason checks on an open decision');

-- no reference left: dependent, non-overridden tasks lose their date (AC15) -----------------------------
update public.decision_options set deleted_at = now() where decision_id = :'dd'::uuid;
:su
select is((select applied_reference_date from public.weddings where id = :'w1_wedding'::uuid), null, 'no scenario left, no reference');
select is((select due_date from public.tasks where id = :'tc'::uuid), null, 'non-overridden dependent task loses its date');
select is((select due_date from public.tasks where template_key = 'k-b'), date '2031-01-01', 'overridden task keeps its date');

-- reason too long on a taken decision
select tests.login(:'w1_founder'::uuid);
update public.decision_options set deleted_at = null where decision_id = :'dd'::uuid;
select public.choose_option(:'dd', :'d1') is not null as ch2 \gset
select throws_ok(format($$select public.reopen_decision(%L, %L)$$, :'dd', repeat('x', 501)), 'P0001', 'reason_too_long', 'reason longer than 500 characters');
:su

-- a user without membership --------------------------------------------------------------------------------
select tests.login(:'nm'::uuid);
select throws_ok($$select public.insert_template_tasks('[]'::jsonb)$$, '42501', null, 'insert_template_tasks without membership');
select throws_ok($$select public.complete_onboarding()$$, '42501', null, 'complete_onboarding without membership');
select throws_ok($$select public.acknowledge_task_review(null)$$, '42501', null, 'acknowledge_task_review without membership');
select throws_ok($$select public.set_reference_scenario(null)$$, '42501', null, 'set_reference_scenario without membership');
select throws_ok(format($$select public.reopen_decision(%L, 'x')$$, :'dd'), '42501', null, 'reopen without membership');
select throws_ok(format($$select public.choose_option(%L, %L)$$, :'dd', :'d1'), '42501', null, 'choose without membership');
:su

-- cap on tasks per wedding (REV-7) ---------------------------------------------------------------------------
insert into public.tasks (wedding_id, title) select :'w2_wedding'::uuid, 't' || g from generate_series(1, 1995) g;
select tests.login(:'w2_founder'::uuid);
select throws_ok($$select public.insert_template_tasks((select jsonb_agg(jsonb_build_object('template_key', 'cap-' || g, 'template_version', 1, 'title', 'x', 'offset', null)) from generate_series(1, 10) g))$$,
  'P0001', 'too_many_tasks', 'a wedding cannot exceed 2000 tasks');
:su

select * from finish();
rollback;
