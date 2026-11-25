-- FEAT-2026-003 / T12: import_guests and undo_guest_import (AC19, AC20, P3, P4, ADR-0002). All data is FAKE.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(65);

select * from tests.make_wedding('gi1') \gset w1_
select * from tests.make_wedding('gi2') \gset w2_
select tests.make_user('gi.stranger@example.test') as stranger \gset
select tests.make_user('gi.family@example.test') as fam \gset
insert into public.memberships (wedding_id, user_id, role) values (:'w1_wedding'::uuid, :'fam'::uuid, 'family');

-- The demo seed has guests with the same first names: start from an empty module (rolled back at the end).
delete from public.guests;
delete from public.guest_groups;
delete from public.guest_tables;

-- An existing group (live) and a deleted one with the same name as an import group.
insert into public.guest_groups (id, wedding_id, name) values
  ('a2000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Famiglia  Rossi'),
  ('a2000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'Amici'),
  ('a2000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'Famiglia Rossi');
update public.guest_groups set deleted_at = now() where id = 'a2000000-0000-4000-8000-000000000002';

-- ===== Denials ====================================================================================
select tests.login_anon();
select throws_ok($$select public.import_guests('[]')$$, '42501', null, 'anon: import_guests has no EXECUTE');
select throws_ok($$select public.undo_guest_import(gen_random_uuid())$$, '42501', null, 'anon: undo_guest_import has no EXECUTE');
:su
select tests.login(:'fam'::uuid);
select throws_ok($$select public.import_guests('[{"first_name":"A"}]')$$, '42501', 'forbidden', 'family: import_guests denied');
select throws_ok($$select public.undo_guest_import(gen_random_uuid())$$, '42501', 'forbidden', 'family: undo_guest_import denied');
:su
select tests.login(:'stranger'::uuid);
select throws_ok($$select public.import_guests('[{"first_name":"A"}]')$$, '42501', 'forbidden', 'no membership: import_guests denied');
select throws_ok($$select public.undo_guest_import(gen_random_uuid())$$, '42501', 'forbidden', 'no membership: undo denied');
:su
select tests.login_service();
select throws_ok($$select public.import_guests('[{"first_name":"A"}]')$$, '42501', 'forbidden', 'secret key (no auth.uid): import_guests refused');
select throws_ok($$select public.undo_guest_import(gen_random_uuid())$$, '42501', 'forbidden', 'secret key: undo refused');
:su
select is((select count(*)::int from public.guests where wedding_id = :'w1_wedding'::uuid), 0, 'nothing was written by the denied calls');

-- ===== A successful import ========================================================================
select tests.login(:'w1_founder'::uuid);
select public.import_guests('[
  {"first_name":"Mario","last_name":"Rossi","category":"adult","side":"A","group":"famiglia rossi","phone":"+39 000 000 0001","email":"mario@example.test","notes":"ciao"},
  {"first_name":"Lucia","last_name":null,"category":"infant","side":"both","group":" FAMIGLIA   ROSSI ","phone":null,"email":null,"notes":null},
  {"first_name":"Anna","last_name":"Verdi","category":"child","side":null,"group":"Nuovo gruppo","phone":null,"email":null,"notes":null},
  {"first_name":"Paolo","category":"adult","side":"B","group":"nuovo  GRUPPO"},
  {"first_name":"Sara","category":"adult","group":"Amici"},
  {"first_name":"Senza gruppo","category":"adult","group":null},
  {"first_name":"Uni","category":"adult","group":"Università"},
  {"first_name":"Uni2","category":"adult","group":"universita"}
]') as r \gset imp_
select is((:'imp_r'::jsonb ->> 'guests')::int, 8, 'import_guests returns the number of people');
select is((:'imp_r'::jsonb ->> 'groups')::int, 4, 'four groups created: Nuovo gruppo, Amici (the deleted one is not reused) and two accent-different university groups');
select is((select count(*)::int from public.guests where import_batch_id = (:'imp_r'::jsonb ->> 'batch_id')::uuid), 8, 'every person carries the batch id');
select is((select count(*)::int from public.guest_groups where import_batch_id = (:'imp_r'::jsonb ->> 'batch_id')::uuid), 4, 'every NEW group carries the batch id');
:su
select is((select group_id from public.guests where first_name = 'Mario' and wedding_id = :'w1_wedding'::uuid), 'a2000000-0000-4000-8000-000000000001'::uuid,
  'an existing live group is reused (case ignored)');
select is((select group_id from public.guests where first_name = 'Lucia' and wedding_id = :'w1_wedding'::uuid), 'a2000000-0000-4000-8000-000000000001'::uuid,
  'an existing live group is reused (spaces ignored)');
select is((select import_batch_id from public.guest_groups where id = 'a2000000-0000-4000-8000-000000000001'), null, 'the reused group is not tagged with the batch');
select is((select count(distinct group_id)::int from public.guests where first_name in ('Anna', 'Paolo')), 1, 'a new group is created once per name (case and spaces ignored)');
select isnt((select group_id from public.guests where first_name = 'Sara'), 'a2000000-0000-4000-8000-000000000002'::uuid, 'a deleted group is not reused: a new one is created');
select isnt((select group_id from public.guests where first_name = 'Uni'), (select group_id from public.guests where first_name = 'Uni2'), 'accents are NOT ignored for groups (AC18)');
select is((select group_id from public.guests where first_name = 'Senza gruppo'), null, 'a row without group stays without group');
select is((select array_agg(side order by first_name) from public.guests where first_name in ('Mario', 'Lucia', 'Paolo', 'Anna')),
  array[null, 'both', 'A', 'B']::text[], 'sides are stored as A / B / both / null');
select is((select category from public.guests where first_name = 'Lucia'), 'infant', 'category stored');
select is((select category from public.guests where first_name = 'Sara'), 'adult', 'a missing category defaults to adult');
select is((select created_by from public.guests where first_name = 'Mario'), :'w1_founder'::uuid, 'created_by is the caller');
select is((select group_id from public.guests where wedding_id = :'w2_wedding'::uuid limit 1), null, 'nothing was written in the other wedding');

-- A second import reuses the groups of the first one (they are live now) and creates none.
select tests.login(:'w1_founder'::uuid);
select public.import_guests('[{"first_name":"Bis","group":"nuovo gruppo"}]') as r \gset bis_
select is((:'bis_r'::jsonb ->> 'groups')::int, 0, 'a group created by a previous import is an existing group now');
:su

-- ===== REV-40: the SQL group key equals the TS `groupKey` (NBSP, tabs, Unicode spaces, case) =======
insert into public.guest_groups (id, wedding_id, name) values
  ('a2000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, 'Famiglia Bianchi'),
  ('a2000000-0000-4000-8000-000000000004', :'w1_wedding'::uuid, 'Zii Veri'),
  ('a2000000-0000-4000-8000-000000000005', :'w1_wedding'::uuid, 'Èlite'),
  ('a2000000-0000-4000-8000-000000000006', :'w1_wedding'::uuid, 'Cugini');
update public.guest_groups set deleted_at = now() where id = 'a2000000-0000-4000-8000-000000000006';
select tests.login(:'w1_founder'::uuid);
select public.import_guests(jsonb_build_array(
  jsonb_build_object('first_name', 'Nbsp', 'group', 'Famiglia' || chr(160) || 'Bianchi' || chr(160)),
  jsonb_build_object('first_name', 'Tab', 'group', chr(9) || 'zii' || chr(9) || chr(9) || 'VERI' || chr(12288)),
  jsonb_build_object('first_name', 'Case', 'group', 'èLITE'),
  jsonb_build_object('first_name', 'Deleted', 'group', 'cugini'),
  jsonb_build_object('first_name', 'Deleted2', 'group', 'CUGINI'),
  jsonb_build_object('first_name', 'Trim', 'group', chr(160) || chr(8201) || 'Nuova' || chr(160)),
  jsonb_build_object('first_name', 'Trim2', 'group', 'nuova')
)) as r \gset key_
:su
select is((:'key_r'::jsonb ->> 'groups')::int, 2, 'NBSP, tab, ideographic space and È/è reuse the existing groups; only Cugini (deleted one ignored) and Nuova are new');
select is((select group_id from public.guests where first_name = 'Nbsp'), 'a2000000-0000-4000-8000-000000000003'::uuid, 'NBSP inside and around a name matches (as JS \s does)');
select is((select group_id from public.guests where first_name = 'Tab'), 'a2000000-0000-4000-8000-000000000004'::uuid, 'tabs and U+3000 are whitespace for the key');
select is((select group_id from public.guests where first_name = 'Case'), 'a2000000-0000-4000-8000-000000000005'::uuid, 'È and è are the same key');
select isnt((select group_id from public.guests where first_name = 'Deleted'), 'a2000000-0000-4000-8000-000000000006'::uuid, 'a deleted group of the same name is never matched');
select is((select group_id from public.guests where first_name = 'Deleted'), (select group_id from public.guests where first_name = 'Deleted2'), 'one new group per key inside a batch');
select is((select name from public.guest_groups where id = (select group_id from public.guests where first_name = 'Trim')), 'Nuova', 'a new group name is trimmed of NBSP and thin spaces at the ends');
select is((select group_id from public.guests where first_name = 'Trim'), (select group_id from public.guests where first_name = 'Trim2'), 'and its key matches "nuova"');

-- ===== Undo (AC20, P4) ============================================================================
-- a person added to a batch group by someone else keeps that group alive
select tests.login(:'w1_founder'::uuid);
select lives_ok(format($$insert into public.guests (wedding_id, first_name, group_id) values (%L, 'Aggiunto dopo', %L)$$,
  :'w1_wedding'::uuid, (select group_id from public.guests where first_name = 'Uni')), 'someone adds a person to a batch group');
select is(public.undo_guest_import(gen_random_uuid()) ->> 'guests', '0', 'an unknown batch removes nothing');
select is(public.undo_guest_import(null) ->> 'guests', '0', 'a null batch removes nothing');
:su
select tests.login(:'w2_founder'::uuid);
select is(public.undo_guest_import((:'imp_r'::jsonb ->> 'batch_id')::uuid) ->> 'guests', '0', 'a batch of another wedding does nothing');
:su
select is((select count(*)::int from public.guests where import_batch_id = (:'imp_r'::jsonb ->> 'batch_id')::uuid), 8, 'the batch is untouched by the other wedding');
select tests.login(:'w1_founder'::uuid);
select public.undo_guest_import((:'bis_r'::jsonb ->> 'batch_id')::uuid) as u \gset ub_
select is((:'ub_u'::jsonb ->> 'guests')::int, 1, 'undo of the second batch removes its person');
select is((:'ub_u'::jsonb ->> 'groups')::int, 0, 'and no group (it only reused one)');
select public.undo_guest_import((:'imp_r'::jsonb ->> 'batch_id')::uuid) as u \gset ua_
select is((:'ua_u'::jsonb ->> 'guests')::int, 8, 'undo removes the 8 people of the batch');
select is((:'ua_u'::jsonb ->> 'groups')::int, 3,'and the batch groups that are left empty (the one with an extra member stays)');
select is(public.undo_guest_import((:'imp_r'::jsonb ->> 'batch_id')::uuid) ->> 'guests', '0', 'undoing twice does nothing');
:su
select is((select count(*)::int from public.guests where import_batch_id = (:'imp_r'::jsonb ->> 'batch_id')::uuid), 0, 'the personal data is physically gone (not "Eliminati di recente")');
select is((select count(*)::int from public.guest_groups where id in ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002')), 2, 'existing groups survive the undo');
select is((select count(*)::int from public.guests where first_name = 'Aggiunto dopo'), 1, 'a person added later survives the undo');
select is((select count(*)::int from public.guest_groups where import_batch_id = (:'imp_r'::jsonb ->> 'batch_id')::uuid), 1, 'the batch group with a member stays');

-- ===== Atomic, limits (AC19) ======================================================================
select tests.login(:'w1_founder'::uuid);
select throws_ok($$select public.import_guests('[{"first_name":"Buona","group":"Gruppo fantasma"},{"first_name":""}]')$$, 'P0001', 'invalid_row', 'one invalid row refuses the whole import');
select is((select count(*)::int from public.guests where first_name = 'Buona') + (select count(*)::int from public.guest_groups where name = 'Gruppo fantasma'), 0, 'nothing is left behind (atomic, groups included)');
select throws_ok($$select public.import_guests('[{"first_name":"Ok","phone":"12"}]')$$, 'P0001', 'invalid_row', 'a bad phone is an invalid row');
select throws_ok($$select public.import_guests('[{"first_name":"Ok","side":"C"}]')$$, 'P0001', 'invalid_row', 'a bad side is an invalid row');
select throws_ok($$select public.import_guests('[{"first_name":"Ok","category":"senior"}]')$$, 'P0001', 'invalid_row', 'a bad category is an invalid row');
select throws_ok(format($$select public.import_guests(%L::jsonb)$$, jsonb_build_array(jsonb_build_object('first_name', 'Ok', 'group', repeat('g', 81)))), 'P0001', 'invalid_row', 'a group name over 80 is an invalid row');
select throws_ok($$select public.import_guests('{"first_name":"Ok"}')$$, 'P0001', 'invalid_row', 'rows must be an array');
select throws_ok($$select public.import_guests('["Ok"]')$$, 'P0001', 'invalid_row', 'every row must be an object');
select throws_ok($$select public.import_guests(null)$$, 'P0001', 'invalid_row', 'null rows are refused');
select is((public.import_guests('[]') ->> 'guests')::int, 0, 'an empty list imports nothing');
select lives_ok(format($$select public.import_guests(%L::jsonb)$$, (select jsonb_agg(jsonb_build_object('first_name', 'Cinque' || n, 'group', 'G' || (n % 7))) from generate_series(1, 500) n)), '500 rows are accepted');
select throws_ok(format($$select public.import_guests(%L::jsonb)$$, (select jsonb_agg(jsonb_build_object('first_name', 'Sei' || n)) from generate_series(1, 501) n)), 'P0001', 'too_many_rows', '501 rows are refused');
select throws_ok(format($$select public.import_guests(%L::jsonb)$$, (select jsonb_agg(jsonb_build_object('first_name', 'Pesante' || n, 'extra', repeat('x', 12000))) from generate_series(1, 100) n)), 'P0001', 'payload_too_large', 'a payload above the size bound is refused (before the rows are looked at)');
select is((select count(*)::int from public.guests where first_name like 'Sei%' or first_name like 'Pesante%'), 0, 'the refused imports wrote nothing');
:su

-- ===== Audit has no personal data after an import and its undo ====================================
select cmp_ok((select count(*)::int from public.audit_log where table_name = 'guests'), '>', 500, 'the import is audited (not vacuous)');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name in ('guests', 'guest_groups', 'guest_tables')
     and (coalesce(a.old_data, '{}'::jsonb) ?| array['first_name', 'last_name', 'phone', 'email', 'notes', 'name']
       or coalesce(a.new_data, '{}'::jsonb) ?| array['first_name', 'last_name', 'phone', 'email', 'notes', 'name'])),
  0, 'no personal key in any audit row (import, undo, hard deletes)');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name in ('guests', 'guest_groups', 'guest_tables')
     and (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '')) ~* 'mario@example|\+39 000|Famiglia|Nuovo gruppo|Aggiunto dopo|Cinque'),
  0, 'no personal value in any audit row');

select * from finish();
rollback;
