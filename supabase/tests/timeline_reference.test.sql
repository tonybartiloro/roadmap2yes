-- T8: reference scenario (AC24, D28), automatic rule of the 2026-11-24 change log, manual choice,
-- return to automatic, recalculation of tasks (AC28) and time-driven sync_timeline.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(34);

select * from tests.make_wedding('tr1') \gset w1_
select * from tests.make_wedding('tr2') \gset w2_
select private.ensure_decisions(:'w1_wedding'::uuid);
select private.ensure_decisions(:'w2_wedding'::uuid);
select id as dd from public.decisions where wedding_id = :'w1_wedding'::uuid and key = 'date' \gset
select id as dd2 from public.decisions where wedding_id = :'w2_wedding'::uuid and key = 'date' \gset
select private.rome_today() as today \gset

create function pg_temp.sc(p_wedding uuid, p_decision uuid, p_from date, p_to date default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.decision_options (decision_id, wedding_id, title) values (p_decision, p_wedding, 'Scenario ' || p_from) returning id into v;
  insert into public.date_scenarios (option_id, wedding_id, kind, date_from, date_to)
  values (v, p_wedding, case when p_to is null then 'fixed' else 'period' end, p_from, p_to);
  return v;
end;
$$;

create function pg_temp.ref(p_wedding uuid) returns text language sql as $$
  select coalesce(r.ref_date::text, '-') || ':' || coalesce(r.state, '-') || ':' || coalesce(r.source, '-')
  from (select 1) x left join private.resolve_reference(p_wedding, private.rome_today()) r on true;
$$;

select is(pg_temp.ref(:'w1_wedding'::uuid), '-:-:-', 'no scenarios, no reference');
select is((select applied_reference_date from public.weddings where id = :'w1_wedding'::uuid), null, 'nothing applied');

-- tasks: dependent, independent, overridden, done, deleted
insert into public.tasks (wedding_id, title, source, template_key, template_version, template_offset) values
  (:'w1_wedding'::uuid, 'dep', 'template', 'k-dep', 1, '{"months": 2}'),
  (:'w1_wedding'::uuid, 'indep', 'template', 'k-indep', 1, null),
  (:'w1_wedding'::uuid, 'over', 'template', 'k-over', 1, '{"months": 2}'),
  (:'w1_wedding'::uuid, 'done', 'template', 'k-done', 1, '{"months": 2}'),
  (:'w1_wedding'::uuid, 'gone', 'template', 'k-gone', 1, '{"months": 2}');
update public.tasks set due_overridden = true, due_date = date '2030-01-01' where title = 'over';
update public.tasks set status = 'done' where title = 'done';
update public.tasks set deleted_at = now() where title = 'gone';

select pg_temp.sc(:'w1_wedding'::uuid, :'dd'::uuid, :'today'::date - 30) as s_past \gset
select is(pg_temp.ref(:'w1_wedding'::uuid), (:'today'::date - 30)::text || ':provisional:automatic', 'only a past scenario: it is the reference (earliest)');
select pg_temp.sc(:'w1_wedding'::uuid, :'dd'::uuid, :'today'::date + 100) as s_100 \gset
select pg_temp.sc(:'w1_wedding'::uuid, :'dd'::uuid, :'today'::date + 50, :'today'::date + 80) as s_50 \gset
select is(pg_temp.ref(:'w1_wedding'::uuid), (:'today'::date + 50)::text || ':provisional:automatic',
  'a past scenario is skipped; the nearest upcoming wins; a period counts by its first day');
select is((select applied_reference_date from public.weddings where id = :'w1_wedding'::uuid), :'today'::date + 50, 'applied date follows');
select is((select due_date from public.tasks where title = 'dep'), (:'today'::date + 50 - make_interval(months => 2))::date, 'dependent task recalculated');
select is((select due_date from public.tasks where title = 'indep'), null, 'independent task untouched');
select is((select due_date from public.tasks where title = 'over'), date '2030-01-01', 'overridden task untouched');
select is((select due_date from public.tasks where title = 'done'), null, 'completed task untouched');
select is((select due_date from public.tasks where title = 'gone'), null, 'deleted task untouched');
select is((select count(*)::int from public.decision_events where kind = 'reference_auto' and decision_id = :'dd'::uuid), 2,
  'each automatic move (past -> +100 -> +50) logs reference_auto; the very first reference does not');

-- soft delete of the nearest: back to +100
update public.decision_options set deleted_at = now() where id = :'s_50'::uuid;
select is(pg_temp.ref(:'w1_wedding'::uuid), (:'today'::date + 100)::text || ':provisional:automatic', 'deleted scenario no longer counts');
select is((select due_date from public.tasks where title = 'dep'), (:'today'::date + 100 - make_interval(months => 2))::date, 'tasks follow');

-- manual reference, valid even in the past
select tests.login(:'w1_founder'::uuid);
select is(public.set_reference_scenario(:'s_past'::uuid) ->> 'source', 'manual', 'manual reference accepted even in the past');
select is((select applied_reference_date from public.weddings), :'today'::date - 30, 'manual date applied');
select is((select count(*)::int from public.decision_events where kind = 'reference_set' and option_id = :'s_past'::uuid), 1, 'reference_set logged');
select is((select actor_id from public.decision_events where kind = 'reference_set' limit 1), :'w1_founder'::uuid, 'with the author');
select is(public.set_reference_scenario(:'s_past'::uuid) ->> 'source', 'manual', 'same choice again is a no-op');
select is((select count(*)::int from public.decision_events where kind = 'reference_set'), 1, 'no duplicate event');
select throws_ok(format($$select public.set_reference_scenario(%L)$$, :'s_50'), 'P0001', 'invalid_option', 'a deleted scenario cannot be the reference');
select throws_ok(format($$select public.set_reference_scenario(%L)$$, gen_random_uuid()), 'P0001', 'invalid_option', 'unknown option');
select is(public.set_reference_scenario(null) ->> 'source', 'automatic', 'set_reference_scenario(null) returns to automatic');
select is((select applied_reference_date from public.weddings), :'today'::date + 100, 'automatic date applied');
select is((select count(*)::int from public.decision_events where kind = 'reference_auto' and reason is null and payload ? 'previous_manual_option_id'),
  1, 'return to automatic logged');
select is(public.set_reference_scenario(null) ->> 'source', 'automatic', 'null again is a no-op');
select is((select count(*)::int from public.decision_events where kind = 'reference_auto' and payload ? 'previous_manual_option_id'), 1, 'no duplicate event');

-- manual scenario deleted: automatic again
select public.set_reference_scenario(:'s_100'::uuid);
update public.decision_options set deleted_at = now() where id = :'s_100'::uuid;
select is((select manual_reference_option_id from public.weddings), null, 'deleting the manual scenario clears the manual choice');
select is((select applied_reference_date from public.weddings), :'today'::date - 30, 'reference falls back to the only remaining scenario');
:su

-- foreign wedding
select tests.login(:'w2_founder'::uuid);
select throws_ok(format($$select public.set_reference_scenario(%L)$$, :'s_past'), 'P0001', 'invalid_option', 'cannot reference a scenario of another wedding');
:su

-- time-driven sync_timeline (secret key only)
select pg_temp.sc(:'w2_wedding'::uuid, :'dd2'::uuid, :'today'::date + 1) as t_soon \gset
select pg_temp.sc(:'w2_wedding'::uuid, :'dd2'::uuid, :'today'::date + 60) as t_later \gset
select is((select applied_reference_date from public.weddings where id = :'w2_wedding'::uuid), :'today'::date + 1, 'nearest upcoming applied');
-- Time passes: the nearest date is now in the past (trigger disabled to mimic a day change).
alter table public.date_scenarios disable trigger date_scenarios_after_write;
update public.date_scenarios set date_from = :'today'::date - 1 where option_id = :'t_soon'::uuid;
alter table public.date_scenarios enable trigger date_scenarios_after_write;
select tests.login(:'w2_founder'::uuid);
select throws_ok($$select public.sync_timeline()$$, '42501', null, 'authenticated cannot run sync_timeline');
:su
select tests.login_service();
select is(public.sync_timeline(:'w2_wedding'::uuid), 1, 'service key runs sync_timeline');
:su
select is((select applied_reference_date from public.weddings where id = :'w2_wedding'::uuid), :'today'::date + 60,
  'the day passed: the reference moved to the next upcoming scenario');
select is((select count(*)::int from public.decision_events where kind = 'reference_auto' and decision_id = :'dd2'::uuid and actor_id is null), 1,
  'a time-driven change is logged with a null (system) actor');

select * from finish();
rollback;
