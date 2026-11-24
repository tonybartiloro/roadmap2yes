-- T8: decisions - onboarding creation, choose (incl. period with exact day), reopen, notes,
-- append-only history, reactions, direct-write matrix and isolation between weddings.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(54);

select * from tests.make_wedding('df1') \gset w1_
select * from tests.make_wedding('df2') \gset w2_
select tests.make_user('df1.b@example.test') as b1 \gset
insert into public.wedding_partners (wedding_id, slot, email, user_id)
values (:'w1_wedding'::uuid, 'B', 'df1.b@example.test', :'b1'::uuid);
insert into public.memberships (wedding_id, user_id, role, partner_slot)
values (:'w1_wedding'::uuid, :'b1'::uuid, 'partner', 'B');
select private.rome_today() + 200 as d_fixed, private.rome_today() + 400 as p_from, private.rome_today() + 460 as p_to,
  private.rome_today() + 430 as p_exact, private.rome_today() + 700 as p_out \gset

-- complete_onboarding -------------------------------------------------------------------------
select tests.login(:'w1_founder'::uuid);
select lives_ok(
  format($$select public.complete_onboarding(%L::jsonb, %L::jsonb)$$,
    jsonb_build_array(
      jsonb_build_object('kind', 'fixed', 'date_from', :'d_fixed', 'label', 'Settembre'),
      jsonb_build_object('kind', 'period', 'date_from', :'p_from', 'date_to', :'p_to')),
    jsonb_build_array(
      jsonb_build_object('template_key', 'scegli-data-e-location', 'template_version', 1, 'title', 'Scegliere data e location', 'offset', null),
      jsonb_build_object('template_key', 'scegli-catering', 'template_version', 1, 'title', 'Scegliere il catering', 'offset', jsonb_build_object('months', 3)))),
  'complete_onboarding creates decisions, scenarios and tasks in one call');
select is((select count(*)::int from public.decisions), 2, 'date and location decisions exist');
select is((select count(*)::int from public.date_scenarios), 2, 'two scenarios created');
select isnt((select onboarding_completed_at from public.weddings), null, 'onboarding_completed_at stamped');
select throws_ok($$select public.complete_onboarding()$$, 'P0001', 'already_completed', 'second complete_onboarding refused');
select is((select count(*)::int from public.tasks), 2, 'tasks inserted');
select is((select due_date from public.tasks where template_key = 'scegli-catering'),
  (:'d_fixed'::date - make_interval(months => 3))::date, 'due date computed from the nearest scenario (offset 3 months)');

select id as dd from public.decisions where key = 'date' \gset
select id as ll from public.decisions where key = 'location' \gset
select o.id as o_fixed from public.decision_options o join public.date_scenarios s on s.option_id = o.id where s.kind = 'fixed' \gset
select o.id as o_period from public.decision_options o join public.date_scenarios s on s.option_id = o.id where s.kind = 'period' \gset

-- choose ----------------------------------------------------------------------------------------
select throws_ok(format($$select public.choose_option(%L, %L, 99, %L)$$, :'dd', :'o_period', :'p_exact'), 'P0001', 'version_conflict',
  'stale decision version is a conflict');
select throws_ok(format($$select public.choose_option(%L, %L, null)$$, :'dd', :'o_period'), 'P0001', 'exact_date_required',
  'a period needs the exact day');
select throws_ok(format($$select public.choose_option(%L, %L, null, %L)$$, :'dd', :'o_period', :'p_out'), 'P0001', 'exact_date_out_of_period',
  'exact day must fall inside the period');
select throws_ok(format($$select public.choose_option(%L, %L, null, %L)$$, :'dd', gen_random_uuid(), :'p_exact'), 'P0001', 'invalid_option',
  'unknown option');
select is((select status from public.decisions where id = :'dd'), 'open', 'failed choices change nothing');
select lives_ok(format($$select public.choose_option(%L, %L, 1, %L)$$, :'dd', :'o_period', :'p_exact'), 'period chosen with an exact day');
select is((select status from public.decisions where id = :'dd'), 'taken', 'decision taken');
select is((select kind || ':' || date_from::text || ':' || coalesce(date_to::text, '-') from public.date_scenarios where option_id = :'o_period'),
  'fixed:' || :'p_exact' || ':-', 'the scenario became a fixed date');
select is((select status from public.decision_options where id = :'o_fixed'), 'discarded', 'the other candidate is discarded');
select is((select applied_reference_date from public.weddings), :'p_exact'::date, 'the chosen date is the reference');
select is((select due_date from public.tasks where template_key = 'scegli-catering'),
  (:'p_exact'::date - make_interval(months => 3))::date, 'tasks recalculated on the chosen date');
select is((select payload #>> '{period,date_to}' from public.decision_events where kind = 'chosen' and decision_id = :'dd'),
  :'p_to', 'the chosen event keeps the original period');
select is((select count(*)::int from public.decision_events where kind = 'option_updated' and decision_id = :'dd'), 0,
  'no extra option_updated for the exact-day conversion');
select throws_ok(format($$select public.choose_option(%L, %L)$$, :'dd', :'o_fixed'), 'P0001', 'already_taken', 'cannot choose twice');
select throws_ok(format($$insert into public.decision_options (decision_id, wedding_id, title) values (%L, %L, 'late')$$, :'dd', :'w1_wedding'),
  'P0001', 'decision_taken', 'no new candidate on a taken decision');
select throws_ok(format($$update public.decision_options set deleted_at = now() where id = %L$$, :'o_period'),
  'P0001', 'option_chosen', 'the chosen option cannot be deleted');

-- reopen ----------------------------------------------------------------------------------------
select throws_ok(format($$select public.reopen_decision(%L, '   ')$$, :'dd'), 'P0001', 'reason_required', 'reopen needs a reason');
select throws_ok(format($$select public.reopen_decision(%L, null)$$, :'dd'), 'P0001', 'reason_required', 'null reason refused');
select lives_ok(format($$select public.reopen_decision(%L, 'La location non e piu libera')$$, :'dd'), 'reopened with a reason');
select is((select status from public.decisions where id = :'dd'), 'open', 'decision open again');
select is((select count(*)::int from public.decision_options where decision_id = :'dd' and status = 'candidate'), 2,
  'discarded options are candidates again');
select is((select manual_reference_option_id from public.weddings), :'o_period'::uuid, 'previous choice stays as manual reference');
select is((select applied_reference_date from public.weddings), :'p_exact'::date, 'same provisional reference after reopening');
select is((select count(*)::int from public.tasks where needs_review), 1, 'dependent tasks flagged for review (only the one with an offset)');
select is((select reason from public.decision_events where kind = 'reopened' and decision_id = :'dd'), 'La location non e piu libera',
  'reopen reason in the history');
select lives_ok($$select public.acknowledge_task_review()$$, '"Va bene così" clears the flags');
select is((select count(*)::int from public.tasks where needs_review), 0, 'no task left to review');

-- notes and append-only history -------------------------------------------------------------------
select lives_ok(format($$select public.add_decision_note(%L, 'Corretto il refuso nel titolo')$$, :'dd'), 'note appended');
select throws_ok(format($$select public.add_decision_note(%L, '  ')$$, :'dd'), 'P0001', 'note_required', 'empty note refused');
select throws_ok($$insert into public.decision_events (decision_id, wedding_id, kind) values (gen_random_uuid(), gen_random_uuid(), 'note')$$,
  '42501', null, 'no direct INSERT into decision_events');
select throws_ok($$update public.decision_events set reason = 'x'$$, '42501', null, 'no direct UPDATE of decision_events');
:su
select throws_ok($$update public.decision_events set reason = 'x'$$, '23000', 'append_only', 'decision_events UPDATE refused even for the owner');
select throws_ok($$delete from public.decision_events$$, '23000', 'append_only', 'decision_events DELETE refused');
select tests.login_service();
select throws_ok($$delete from public.decision_events$$, '23000', 'append_only', 'decision_events DELETE refused with the secret key');
:su

-- direct writes -----------------------------------------------------------------------------------
select tests.login(:'w1_founder'::uuid);
select throws_ok(format($$update public.decision_options set status = 'chosen' where id = %L$$, :'o_fixed'), '42501', null, 'status is not directly writable');
select throws_ok(format($$update public.decisions set status = 'taken' where id = %L$$, :'dd'), '42501', null, 'decision status is not directly writable');
select lives_ok(format($$update public.decisions set question = 'Quando ci sposiamo?' where id = %L$$, :'dd'), 'question is editable');

-- reactions --------------------------------------------------------------------------------------
select lives_ok(format($$insert into public.option_reactions (option_id, wedding_id, user_id, reaction) values (%L, %L, %L, 'prefer')$$,
  :'o_fixed', :'w1_wedding', :'w1_founder'), 'own reaction');
select throws_ok(format($$insert into public.option_reactions (option_id, wedding_id, user_id, reaction) values (%L, %L, %L, 'doubt')$$,
  :'o_fixed', :'w1_wedding', :'b1'), '42501', null, 'cannot react in the name of the partner');
select is((select status from public.decision_options where id = :'o_fixed'), 'candidate', 'a reaction does not change the state');
:su
select tests.login(:'b1'::uuid);
select is((select count(*)::int from public.option_reactions), 1, 'the partner sees the reaction');
update public.option_reactions set reaction = 'doubt';
select is((select reaction from public.option_reactions), 'prefer', 'the partner cannot edit the other reaction');
:su

-- isolation ---------------------------------------------------------------------------------------
select tests.login(:'w2_founder'::uuid);
select is((select count(*)::int from public.decisions) + (select count(*)::int from public.decision_options)
  + (select count(*)::int from public.decision_events) + (select count(*)::int from public.tasks), 0, 'foreign wedding sees nothing');
select throws_ok(format($$select public.choose_option(%L, %L)$$, :'dd', :'o_fixed'), '42501', null, 'foreign wedding cannot choose');
select throws_ok(format($$select public.reopen_decision(%L, 'x')$$, :'dd'), '42501', null, 'foreign wedding cannot reopen');
select throws_ok(format($$insert into public.decision_options (decision_id, wedding_id, title) values (%L, %L, 'x')$$, :'dd', :'w1_wedding'),
  '42501', null, 'cannot add an option to a foreign decision (RLS)');
:su
select throws_ok(format($$insert into public.decision_options (decision_id, wedding_id, title) values (%L, %L, 'x')$$, :'dd', :'w2_wedding'),
  '23503', null, 'composite FK refuses a decision of another wedding');

select * from finish();
rollback;
