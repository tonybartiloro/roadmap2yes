-- T8 (Gate B, Q7, AC60): a date scenario can be linked to a location candidate of the same wedding.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(17);

select * from tests.make_wedding('dl1') \gset w1_
select * from tests.make_wedding('dl2') \gset w2_
select private.ensure_decisions(:'w1_wedding'::uuid);
select private.ensure_decisions(:'w2_wedding'::uuid);
select id as dd from public.decisions where wedding_id = :'w1_wedding'::uuid and key = 'date' \gset
select id as ld from public.decisions where wedding_id = :'w1_wedding'::uuid and key = 'location' \gset
select id as ld2 from public.decisions where wedding_id = :'w2_wedding'::uuid and key = 'location' \gset
select private.rome_today() as today \gset

insert into public.decision_options (decision_id, wedding_id, title) values (:'dd', :'w1_wedding', 'D1') returning id as d1 \gset
insert into public.decision_options (decision_id, wedding_id, title) values (:'dd', :'w1_wedding', 'D2') returning id as d2 \gset
insert into public.date_scenarios (option_id, wedding_id, kind, date_from) values (:'d1', :'w1_wedding', 'fixed', :'today'::date + 100);
insert into public.date_scenarios (option_id, wedding_id, kind, date_from) values (:'d2', :'w1_wedding', 'fixed', :'today'::date + 200);
insert into public.decision_options (decision_id, wedding_id, title) values (:'ld', :'w1_wedding', 'Villa A') returning id as l1 \gset
insert into public.decision_options (decision_id, wedding_id, title) values (:'ld', :'w1_wedding', 'Villa B') returning id as l2 \gset
insert into public.decision_options (decision_id, wedding_id, title) values (:'ld', :'w1_wedding', 'Villa C') returning id as l3 \gset
insert into public.decision_options (decision_id, wedding_id, title) values (:'ld2', :'w2_wedding', 'Villa Z') returning id as lz \gset

select tests.login(:'w1_founder'::uuid);
select lives_ok(format($$update public.date_scenarios set location_option_id = %L where option_id = %L$$, :'l1', :'d1'), 'link a date to a location');
select is((select payload #>> '{new,location_option_id}' from public.decision_events where kind = 'option_updated' and option_id = :'d1'::uuid),
  :'l1', 'linking logs option_updated');
select throws_ok(format($$update public.date_scenarios set location_option_id = %L where option_id = %L$$, :'d2', :'d1'),
  'P0001', 'invalid_location', 'only location options can be linked');
select throws_ok(format($$update public.date_scenarios set location_option_id = %L where option_id = %L$$, :'lz', :'d1'),
  'P0001', 'invalid_location', 'a location of another wedding cannot be linked');
select throws_ok(format($$insert into public.date_scenarios (option_id, wedding_id, kind, date_from) values (%L, %L, 'fixed', current_date)$$, :'l2', :'w1_wedding'),
  'P0001', 'not_a_date_option', 'a scenario can only hang on a date option');
select throws_ok(format($$insert into public.date_scenarios (option_id, wedding_id, kind, date_from, date_to) values (%L, %L, 'period', '2028-05-01', '2028-04-01')$$, :'d2', :'w1_wedding'),
  '23514', null, 'period end before start refused');

-- delete a location: the link is cleared and logged
select lives_ok(format($$update public.date_scenarios set location_option_id = %L where option_id = %L$$, :'l3', :'d2'), 'link the second date');
select lives_ok(format($$update public.decision_options set deleted_at = now() where id = %L$$, :'l3'), 'delete the location');
select is((select location_option_id from public.date_scenarios where option_id = :'d2'::uuid), null, 'deleting the location unlinks the date');
select is((select payload #>> '{old,location_option_id}' from public.decision_events
  where kind = 'option_updated' and option_id = :'d2'::uuid and payload #>> '{new,location_option_id}' is null), :'l3', 'unlink logged with the old location');
select throws_ok(format($$update public.date_scenarios set location_option_id = %L where option_id = %L$$, :'l3', :'d2'),
  'P0001', 'location_deleted', 'a deleted location cannot be linked');

-- choosing the date does not choose the location; a discarded location stays linked
select lives_ok(format($$select public.choose_option(%L, %L)$$, :'dd', :'d1'), 'choose the linked date');
select is((select status from public.decisions where id = :'ld'::uuid), 'open', 'the location decision is untouched');
select lives_ok(format($$select public.choose_option(%L, %L)$$, :'ld', :'l2'), 'choose another location');
select is((select status from public.decision_options where id = :'l1'::uuid), 'discarded', 'the linked location is now discarded');
select is((select location_option_id from public.date_scenarios where option_id = :'d1'::uuid), :'l1'::uuid, 'a discarded location stays linked (shown as "scartata")');
select throws_ok(format($$update public.decision_options set deleted_at = now() where id = %L$$, :'l2'), 'P0001', 'option_chosen', 'chosen location cannot be deleted');

select * from finish();
rollback;
