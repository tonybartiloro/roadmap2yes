-- FEAT-2026-003 / T1: data model, triggers, audit WITHOUT personal data, atomic family, bulk actions and
-- their undo, no expiry (AC2, AC4, AC5, AC7, AC10, AC11, AC13, BR5, BR10, ADR-0002). All emails are FAKE.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(153);

select * from tests.make_wedding('gm1') \gset w1_
select * from tests.make_wedding('gm2') \gset w2_

-- Fixtures as the owner (fixed ids). G = live groups, GD = deleted; T = live tables, TD = deleted.
insert into public.guest_groups (id, wedding_id, name) values
  ('a1000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'G1'),
  ('a1000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'G2'),
  ('a1000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, 'G3'),
  ('a1000000-0000-4000-8000-000000000004', :'w1_wedding'::uuid, 'GD'),
  ('a1000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'GW2');
insert into public.guest_tables (id, wedding_id, name) values
  ('b1000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'T1'),
  ('b1000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'TD'),
  ('b1000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'TW2');
update public.guest_groups set deleted_at = now() where id = 'a1000000-0000-4000-8000-000000000004';
update public.guest_tables set deleted_at = now() where id = 'b1000000-0000-4000-8000-000000000002';
insert into public.guests (id, wedding_id, first_name) values
  ('c1000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'U1'),
  ('c1000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'U2'),
  ('c1000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, 'U3'),
  ('c1000000-0000-4000-8000-000000000004', :'w1_wedding'::uuid, 'U4'),
  ('c1000000-0000-4000-8000-000000000005', :'w1_wedding'::uuid, 'UD'),
  ('c1000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'UW2');
update public.guests set deleted_at = now() where id = 'c1000000-0000-4000-8000-000000000005';

-- ===== CHECK limits (AC2, AC4): the table constraints, as the owner ================================
select lives_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat('x', 80)), 'first_name: 80 chars ok');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat('x', 81)), '23514', null, 'first_name: 81 chars refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, '')$$, :'w1_wedding'::uuid), '23514', null, 'first_name: empty refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, '   ')$$, :'w1_wedding'::uuid), '23514', null, 'first_name: blank refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, null)$$, :'w1_wedding'::uuid), '23502', null, 'first_name: null refused');
select lives_ok(format($$insert into public.guests (wedding_id, first_name, last_name) values (%L, 'A', %L)$$, :'w1_wedding'::uuid, repeat('x', 80)), 'last_name: 80 ok');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, last_name) values (%L, 'A', %L)$$, :'w1_wedding'::uuid, repeat('x', 81)), '23514', null, 'last_name: 81 refused');
select lives_ok(format($$insert into public.guests (wedding_id, first_name, notes) values (%L, 'A', %L)$$, :'w1_wedding'::uuid, repeat('n', 500)), 'notes: 500 ok');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, notes) values (%L, 'A', %L)$$, :'w1_wedding'::uuid, repeat('n', 501)), '23514', null, 'notes: 501 refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, phone) values (%L, 'A', '12345')$$, :'w1_wedding'::uuid), '23514', null, 'phone: 5 chars refused');
select lives_ok(format($$insert into public.guests (wedding_id, first_name, phone) values (%L, 'A', '123456')$$, :'w1_wedding'::uuid), 'phone: 6 chars ok');
select lives_ok(format($$insert into public.guests (wedding_id, first_name, phone) values (%L, 'A', %L)$$, :'w1_wedding'::uuid, '+' || repeat('1', 19)), 'phone: 20 chars ok');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, phone) values (%L, 'A', %L)$$, :'w1_wedding'::uuid, '+' || repeat('1', 20)), '23514', null, 'phone: 21 chars refused');
select lives_ok(format($$insert into public.guests (wedding_id, first_name, phone) values (%L, 'A', '+39 (02) 12.34/56-7')$$, :'w1_wedding'::uuid), 'phone: + digits space ( ) . / - allowed');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, phone) values (%L, 'A', '12345abc')$$, :'w1_wedding'::uuid), '23514', null, 'phone: letters refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, phone) values (%L, 'A', '123456;7')$$, :'w1_wedding'::uuid), '23514', null, 'phone: ; refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, phone) values (%L, 'A', '')$$, :'w1_wedding'::uuid), '23514', null, 'phone: empty string refused (the app sends null)');
select lives_ok(format($$insert into public.guests (wedding_id, first_name, email) values (%L, 'A', 'Nome.Cognome@Example.Test')$$, :'w1_wedding'::uuid), 'email: standard address ok (citext)');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, email) values (%L, 'A', 'no-at-sign')$$, :'w1_wedding'::uuid), '23514', null, 'email: no @ refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, email) values (%L, 'A', 'a b@example.test')$$, :'w1_wedding'::uuid), '23514', null, 'email: space refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, email) values (%L, 'A', 'a@nodot')$$, :'w1_wedding'::uuid), '23514', null, 'email: no domain dot refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, category) values (%L, 'A', 'senior')$$, :'w1_wedding'::uuid), '23514', null, 'category: outside adult/child/infant refused');
select is((select category from public.guests where id = 'c1000000-0000-4000-8000-000000000001'), 'adult', 'category defaults to adult');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, side) values (%L, 'A', 'C')$$, :'w1_wedding'::uuid), '23514', null, 'side: outside A/B/both refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, side) values (%L, 'A', '')$$, :'w1_wedding'::uuid), '23514', null, 'side: empty string refused (stored as null)');
select lives_ok(format($$insert into public.guests (id, wedding_id, first_name, side) values
  ('d1000000-0000-4000-8000-000000000001', %1$L, 'SA', 'A'), ('d1000000-0000-4000-8000-000000000002', %1$L, 'SB', 'B'),
  ('d1000000-0000-4000-8000-000000000003', %1$L, 'SBoth', 'both'), ('d1000000-0000-4000-8000-000000000004', %1$L, 'SNone', null)$$,
  :'w1_wedding'::uuid), 'side: A, B, both and null are accepted');
select is((select array_agg(coalesce(side, '-') order by id) from public.guests where id::text like 'd1000000%'),
  array['A', 'B', 'both', '-']::text[], 'side is stored as A / B / both / null, never a name');

select lives_ok(format($$insert into public.guest_groups (wedding_id, name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat('g', 80)), 'group name: 80 ok');
select throws_ok(format($$insert into public.guest_groups (wedding_id, name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat('g', 81)), '23514', null, 'group name: 81 refused');
select throws_ok(format($$insert into public.guest_groups (wedding_id, name) values (%L, '  ')$$, :'w1_wedding'::uuid), '23514', null, 'group name: blank refused');
select lives_ok(format($$insert into public.guest_tables (wedding_id, name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat('t', 60)), 'table name: 60 ok');
select throws_ok(format($$insert into public.guest_tables (wedding_id, name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat('t', 61)), '23514', null, 'table name: 61 refused');
select throws_ok(format($$insert into public.guest_tables (wedding_id, name, capacity) values (%L, 'C', 0)$$, :'w1_wedding'::uuid), '23514', null, 'capacity 0 refused');
select lives_ok(format($$insert into public.guest_tables (wedding_id, name, capacity) values (%L, 'C', 1)$$, :'w1_wedding'::uuid), 'capacity 1 ok');
select lives_ok(format($$insert into public.guest_tables (wedding_id, name, capacity) values (%L, 'C', 50)$$, :'w1_wedding'::uuid), 'capacity 50 ok');
select throws_ok(format($$insert into public.guest_tables (wedding_id, name, capacity) values (%L, 'C', 51)$$, :'w1_wedding'::uuid), '23514', null, 'capacity 51 refused');
select lives_ok(format($$insert into public.guest_tables (id, wedding_id, name, capacity) values ('b1000000-0000-4000-8000-0000000000f1', %L, 'C', null)$$, :'w1_wedding'::uuid), 'capacity null ok (no limit)');
select throws_ok(format($$insert into public.guest_tables (wedding_id, name, shape) values (%L, 'C', 'oval')$$, :'w1_wedding'::uuid), '23514', null, 'shape outside round/rect refused');
select is((select shape || ':' || coalesce(pos_x::text, 'null') || ':' || coalesce(pos_y::text, 'null') from public.guest_tables where id = 'b1000000-0000-4000-8000-0000000000f1'),
  'round:null:null', 'a table defaults to round and not placed (BR10)');

-- Integrity: composite FKs and the immutable import batch.
select throws_ok(format($$insert into public.guests (wedding_id, first_name, group_id) values (%L, 'X', 'a1000000-0000-4000-8000-000000000009')$$, :'w1_wedding'::uuid),
  '23503', null, 'FK: a W1 guest cannot hang from a W2 group');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, table_id) values (%L, 'X', 'b1000000-0000-4000-8000-000000000009')$$, :'w1_wedding'::uuid),
  '23503', null, 'FK: a W1 guest cannot hang from a W2 table');
select throws_ok($$update public.guests set group_id = 'a1000000-0000-4000-8000-000000000009' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'FK: updating the pointer to a W2 group is refused too');
select throws_ok($$update public.guests set import_batch_id = gen_random_uuid() where id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23000', 'immutable_column', 'import_batch_id is immutable');

-- ===== Triggers: version, audit columns, soft delete stamps, no assignment to a deleted target =====
-- (the `id` column is not insertable by users: this one is a fixture of the owner)
reset role;
insert into public.guests (id, wedding_id, first_name) values ('e1000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Trig');
select tests.login(:'w1_founder'::uuid);
select lives_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, 'Trig0')$$, :'w1_wedding'::uuid), 'insert as partner');
select is((select version || ':' || (created_by = auth.uid())::text from public.guests where first_name = 'Trig0'), '1:true', 'insert: version 1, created_by stamped');
select lives_ok($$update public.guests set last_name = 'Z' where id = 'e1000000-0000-4000-8000-000000000001'$$, 'update');
select is((select version || ':' || (updated_by = auth.uid())::text from public.guests where id = 'e1000000-0000-4000-8000-000000000001'), '2:true', 'update: version bumped, updated_by stamped');
select lives_ok($$update public.guests set deleted_at = '2001-01-01' where id = 'e1000000-0000-4000-8000-000000000001'$$, 'soft delete (the client time is ignored)');
select is((select (deleted_at > now() - interval '1 minute')::text || ':' || (deleted_by = auth.uid())::text from public.guests where id = 'e1000000-0000-4000-8000-000000000001'),
  'true:true', 'soft delete: deleted_at is the server time, deleted_by is the caller');
select lives_ok($$update public.guests set deleted_at = '2002-02-02', notes = 'n' where id = 'e1000000-0000-4000-8000-000000000001'$$, 'edit a deleted guest');
select is((select (deleted_at > now() - interval '1 minute')::text from public.guests where id = 'e1000000-0000-4000-8000-000000000001'), 'true', 'an already deleted row keeps its deleted_at');
select lives_ok($$update public.guests set deleted_at = null where id = 'e1000000-0000-4000-8000-000000000001'$$, 'restore');
select is((select deleted_by from public.guests where id = 'e1000000-0000-4000-8000-000000000001'), null, 'restore clears deleted_by');

select throws_ok($$update public.guests set group_id = 'a1000000-0000-4000-8000-000000000004' where id = 'e1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'group_deleted', 'cannot assign a guest to a deleted group');
select throws_ok($$update public.guests set table_id = 'b1000000-0000-4000-8000-000000000002' where id = 'e1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'table_deleted', 'cannot assign a guest to a deleted table');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, group_id) values (%L, 'X', 'a1000000-0000-4000-8000-000000000004')$$, :'w1_wedding'::uuid),
  'P0001', 'group_deleted', 'cannot insert a guest into a deleted group');
select lives_ok($$update public.guests set group_id = 'a1000000-0000-4000-8000-000000000001', table_id = 'b1000000-0000-4000-8000-000000000001' where id = 'e1000000-0000-4000-8000-000000000001'$$,
  'assignment to a live group and table works');

-- P2: deleting a group keeps the pointer (the member is "Senza gruppo" in the app, and comes back on restore).
select lives_ok($$update public.guest_groups set deleted_at = now() where id = 'a1000000-0000-4000-8000-000000000001'$$, 'soft delete a group');
select is((select group_id from public.guests where id = 'e1000000-0000-4000-8000-000000000001'), 'a1000000-0000-4000-8000-000000000001'::uuid, 'the member keeps its group pointer');
select lives_ok($$update public.guests set first_name = 'Trig2' where id = 'e1000000-0000-4000-8000-000000000001'$$, 'a member of a deleted group can still be edited');
select lives_ok($$update public.guest_groups set deleted_at = null where id = 'a1000000-0000-4000-8000-000000000001'$$, 'restore the group');
select is((select deleted_by from public.guest_groups where id = 'a1000000-0000-4000-8000-000000000001'), null, 'group restore clears deleted_by');
select lives_ok($$update public.guest_tables set deleted_at = now() where id = 'b1000000-0000-4000-8000-000000000001'$$, 'soft delete a table');
select is((select deleted_by from public.guest_tables where id = 'b1000000-0000-4000-8000-000000000001'), auth.uid(), 'table soft delete stamps deleted_by');
select lives_ok($$update public.guest_tables set deleted_at = null where id = 'b1000000-0000-4000-8000-000000000001'$$, 'restore the table');
:su

-- ===== Audit WITHOUT personal data (AC13, ADR-0002) ===============================================
select tests.login(:'w1_founder'::uuid);
insert into public.guest_groups (wedding_id, name) values (:'w1_wedding'::uuid, 'Nome Gruppo Segretissimo') returning id as ag \gset
insert into public.guest_tables (wedding_id, name, capacity) values (:'w1_wedding'::uuid, 'Nome Tavolo Segretissimo', 6) returning id as at \gset
insert into public.guests (wedding_id, first_name, last_name, category, side, phone, email, notes, group_id, table_id) values
  (:'w1_wedding'::uuid, 'Zedmario', 'Zetarossi', 'child', 'B', '+39 000 000 9999',
   'zed.zeta@example.test', 'Allergia segretissima', :'ag'::uuid, :'at'::uuid) returning id as au \gset
update public.guests set first_name = 'Zedmario2', phone = '+39 000 000 9998', notes = 'Nota segretissima 2' where id = :'au'::uuid;
update public.guest_groups set name = 'Nome Gruppo Segretissimo 2' where id = :'ag'::uuid;
update public.guest_tables set name = 'Nome Tavolo Segretissimo 2' where id = :'at'::uuid;
update public.guests set deleted_at = now() where id = :'au'::uuid;
update public.guest_groups set deleted_at = now() where id = :'ag'::uuid;
update public.guest_tables set deleted_at = now() where id = :'at'::uuid;
delete from public.guests where id = :'au'::uuid;
delete from public.guest_groups where id = :'ag'::uuid;
delete from public.guest_tables where id = :'at'::uuid;
select * from public.create_guest_family('Famiglia Audit Segretissima', 'A', '[{"first_name":"Zedfamiglia","last_name":"Zetafam","email":"zedfam@example.test","phone":"+39 000 000 9997","notes":"Nota famiglia segretissima"}]') as f \gset fam_
select * from public.guests_bulk(array[(select id from public.guests where first_name = 'Zedfamiglia')], 'delete') as b \gset bulk_
:su

select cmp_ok((select count(*)::int from public.audit_log where table_name = 'guests'), '>=', 8, 'audit is not vacuous: guests rows are audited');
select is((select array_agg(distinct op order by op) from public.audit_log where table_name = 'guests'), array['DELETE', 'INSERT', 'UPDATE']::text[], 'guests: INSERT, UPDATE and DELETE are audited');
select is((select array_agg(distinct op order by op) from public.audit_log where table_name = 'guest_groups'), array['DELETE', 'INSERT', 'UPDATE']::text[], 'guest_groups: INSERT, UPDATE and DELETE are audited');
select is((select array_agg(distinct op order by op) from public.audit_log where table_name = 'guest_tables'), array['DELETE', 'INSERT', 'UPDATE']::text[], 'guest_tables: INSERT, UPDATE and DELETE are audited');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name in ('guests', 'guest_groups', 'guest_tables')
     and (coalesce(a.old_data, '{}'::jsonb) ?| array['first_name', 'last_name', 'phone', 'email', 'notes', 'name']
       or coalesce(a.new_data, '{}'::jsonb) ?| array['first_name', 'last_name', 'phone', 'email', 'notes', 'name'])),
  0, 'no audit row of the three tables carries a personal key (first_name, last_name, phone, email, notes, name)');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name in ('guests', 'guest_groups', 'guest_tables')
     and (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '')) ~* 'zed|zeta|segretissim|example\.test|\+39 000'),
  0, 'no personal VALUE (name, phone, email, notes, group or table name) appears anywhere in the audit');
select is(
  (select (a.new_data ->> 'category') || ':' || (a.new_data ->> 'side') || ':' || (a.new_data ->> 'wedding_id')
   from public.audit_log a where a.table_name = 'guests' and a.op = 'INSERT' and a.row_id = :'au'),
  'child:B:' || :'w1_wedding', 'the audit keeps the structural fields (category, side, wedding) and the row id');
select is((select a.actor_id from public.audit_log a where a.table_name = 'guests' and a.op = 'INSERT' and a.row_id = :'au'),
  :'w1_founder'::uuid, 'the audit keeps who did it');
select is((select a.old_data ->> 'group_id' from public.audit_log a where a.table_name = 'guests' and a.op = 'DELETE' and a.row_id = :'au'),
  :'ag', 'the DELETE audit keeps the structural fields too');
select is((select count(*)::int from public.guests where id = :'au'), 0, 'after the hard delete the guest is gone from the database (AC11)');

-- ===== create_guest_family: atomic (AC5) ===========================================================
select tests.login(:'w1_founder'::uuid);
select is((:'fam_f'::jsonb -> 'guest_ids') is not null and jsonb_array_length(:'fam_f'::jsonb -> 'guest_ids') = 1, true, 'create_guest_family returns the group and the guest ids');
select * from public.create_guest_family('Famiglia Rossi', 'B',
  '[{"first_name":"Mario","last_name":"Rossi","category":"adult","phone":"+39 000 000 1111","email":"mario.rossi@example.test"},
    {"first_name":"Luisa","category":"adult"},{"first_name":"Gigi","category":"child"},{"first_name":"Neo","category":"infant"}]') as f \gset ok_
select is((select count(*)::int from public.guests where group_id = (:'ok_f'::jsonb ->> 'group_id')::uuid), 4, 'family: group and 4 people created in one call');
select is((select array_agg(distinct side) from public.guests where group_id = (:'ok_f'::jsonb ->> 'group_id')::uuid), array['B']::text[], 'family: the side applies to every person');
select is((select count(*)::int from public.guests where group_id = (:'ok_f'::jsonb ->> 'group_id')::uuid and category = 'infant'), 1, 'family: category respected');
select is((select count(*)::int from public.guests where group_id = (:'ok_f'::jsonb ->> 'group_id')::uuid and wedding_id = :'w1_wedding'::uuid), 4, 'family: every person belongs to the caller''s wedding');
select throws_ok($$select public.create_guest_family('Famiglia Rotta', 'A', '[{"first_name":"Ok"},{"first_name":""}]')$$, 'P0001', 'invalid_row', 'family: one invalid row refuses the whole save');
select is((select count(*)::int from public.guest_groups where name = 'Famiglia Rotta') + (select count(*)::int from public.guests where first_name = 'Ok'), 0, 'family: nothing is left behind after the failure (atomic)');
select throws_ok($$select public.create_guest_family('Famiglia Rotta', 'A', '[{"first_name":"Ok","phone":"12"}]')$$, 'P0001', 'invalid_row', 'family: a bad phone is an invalid row');
select throws_ok($$select public.create_guest_family('Famiglia Rotta', 'C', '[{"first_name":"Ok"}]')$$, 'P0001', 'invalid_row', 'family: a bad side is an invalid row');
select throws_ok($$select public.create_guest_family('', 'A', '[{"first_name":"Ok"}]')$$, 'P0001', 'invalid_row', 'family: an empty group name is refused');
select throws_ok($$select public.create_guest_family(null, 'A', '[{"first_name":"Ok"}]')$$, 'P0001', 'invalid_row', 'family: a null group name is refused');
select throws_ok($$select public.create_guest_family('Famiglia Rotta', 'A', '{"first_name":"Ok"}')$$, 'P0001', 'invalid_row', 'family: rows must be an array');
select throws_ok($$select public.create_guest_family('Famiglia Rotta', 'A', '["Ok"]')$$, 'P0001', 'invalid_row', 'family: every row must be an object');
select throws_ok($$select public.create_guest_family('Famiglia Rotta', 'A', '[{"first_name":"Ok","category":"senior"}]')$$, 'P0001', 'invalid_row', 'family: a bad category is an invalid row');
select is((select count(*)::int from public.guests where first_name = 'Ok'), 0, 'family: still nothing left behind');
:su

-- ===== guests_bulk and guests_bulk_undo (AC7, P6) ==================================================
select tests.login(:'w1_founder'::uuid);
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000009', gen_random_uuid()]::uuid[], 'assign_group', 'a1000000-0000-4000-8000-000000000002') as guests_bulk \gset r1_
select is((:'r1_guests_bulk'::jsonb ->> 'changed')::int, 3, 'assign_group: only live guests of the own wedding change (deleted, foreign and unknown ids are ignored)');
select is(jsonb_array_length(:'r1_guests_bulk'::jsonb -> 'previous'), 3, 'previous lists the 3 changed rows only');
select is((select count(*)::int from public.guests where group_id = 'a1000000-0000-4000-8000-000000000002'), 3, 'the 3 guests are in the group');
select is((:'r1_guests_bulk'::jsonb -> 'previous' -> 0 ->> 'op') || ':' || coalesce(:'r1_guests_bulk'::jsonb -> 'previous' -> 0 ->> 'group_id', 'null'), 'assign_group:null', 'previous carries the op and the value before');
select is((public.guests_bulk(array['c1000000-0000-4000-8000-000000000001']::uuid[], 'assign_group', 'a1000000-0000-4000-8000-000000000002') ->> 'changed')::int, 0, 'assigning the same group again changes nothing');
select throws_ok($$select public.guests_bulk(array['c1000000-0000-4000-8000-000000000001']::uuid[], 'assign_group', 'a1000000-0000-4000-8000-000000000004')$$, 'P0001', 'group_deleted', 'assign_group to a deleted group is refused');
select throws_ok($$select public.guests_bulk(array['c1000000-0000-4000-8000-000000000001']::uuid[], 'assign_group', 'a1000000-0000-4000-8000-000000000009')$$, 'P0001', 'invalid_target', 'assign_group to a group of another wedding is refused');
select throws_ok($$select public.guests_bulk(array['c1000000-0000-4000-8000-000000000001']::uuid[], 'assign_group', null)$$, 'P0001', 'invalid_target', 'assign_group without a target is refused');
select throws_ok($$select public.guests_bulk(array['c1000000-0000-4000-8000-000000000001']::uuid[], 'assign_table', 'b1000000-0000-4000-8000-000000000002')$$, 'P0001', 'table_deleted', 'assign_table to a deleted table is refused');
select throws_ok($$select public.guests_bulk(array['c1000000-0000-4000-8000-000000000001']::uuid[], 'assign_table', 'b1000000-0000-4000-8000-000000000009')$$, 'P0001', 'invalid_target', 'assign_table to a table of another wedding is refused');
select throws_ok($$select public.guests_bulk(array['c1000000-0000-4000-8000-000000000001']::uuid[], 'purge')$$, 'P0001', 'invalid_op', 'unknown op is refused');
select throws_ok($$select public.guests_bulk(null, 'delete')$$, 'P0001', 'invalid_ids', 'null ids are refused');
select is((public.guests_bulk('{}'::uuid[], 'delete') ->> 'changed')::int, 0, 'an empty selection changes nothing');

-- undo: put the previous group back; the last save wins over a change made meanwhile
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002']::uuid[], 'assign_group', 'a1000000-0000-4000-8000-000000000003') as guests_bulk \gset r2_
update public.guests set group_id = null where id = 'c1000000-0000-4000-8000-000000000001';
select is((public.guests_bulk_undo(:'r2_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 2, 'undo of assign_group restores both guests');
select is((select count(*)::int from public.guests where id in ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002') and group_id = 'a1000000-0000-4000-8000-000000000002'), 2, 'the saved group is back (last save wins over the change made meanwhile)');

-- undo skips: guest deleted meanwhile, previous group deleted meanwhile, guest gone
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000003']::uuid[], 'assign_group', 'a1000000-0000-4000-8000-000000000003') as guests_bulk \gset r3_
update public.guests set deleted_at = now() where id = 'c1000000-0000-4000-8000-000000000003';
select is((public.guests_bulk_undo(:'r3_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 0, 'undo of an assignment skips a guest deleted in the meantime');
select is((select group_id::text || ':' || (deleted_at is not null)::text from public.guests where id = 'c1000000-0000-4000-8000-000000000003'),
  'a1000000-0000-4000-8000-000000000003:true', 'that guest stays deleted and in its current group');
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000001']::uuid[], 'assign_group', 'a1000000-0000-4000-8000-000000000003') as guests_bulk \gset r4_
update public.guest_groups set deleted_at = now() where id = 'a1000000-0000-4000-8000-000000000002';
select is((public.guests_bulk_undo(:'r4_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 0, 'undo does not assign back to a group deleted in the meantime');
select is((select group_id from public.guests where id = 'c1000000-0000-4000-8000-000000000001'), 'a1000000-0000-4000-8000-000000000003'::uuid, 'the guest keeps the current group');

-- tables
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002']::uuid[], 'assign_table', 'b1000000-0000-4000-8000-0000000000f1') as guests_bulk \gset r5_
select is((:'r5_guests_bulk'::jsonb ->> 'changed')::int, 2, 'assign_table assigns the table');
select is((public.guests_bulk_undo(:'r5_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 2, 'undo of assign_table restores "no table"');
select is((select count(*)::int from public.guests where table_id is not null and id in ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')), 0, 'the tables were removed again');

-- delete / restore and their undo (AC7, AC10)
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000004']::uuid[], 'delete') as guests_bulk \gset r6_
select is((:'r6_guests_bulk'::jsonb ->> 'changed')::int, 1, 'bulk delete soft-deletes');
select is((select (deleted_by = auth.uid())::text from public.guests where id = 'c1000000-0000-4000-8000-000000000004'), 'true', 'bulk delete stamps deleted_by');
select is((public.guests_bulk(array['c1000000-0000-4000-8000-000000000004']::uuid[], 'delete') ->> 'changed')::int, 0, 'deleting an already deleted guest changes nothing');
select is((public.guests_bulk_undo(:'r6_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 1, 'undo of delete brings the guest back');
select is((select deleted_at from public.guests where id = 'c1000000-0000-4000-8000-000000000004'), null, 'the guest is live again');
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000005']::uuid[], 'restore') as guests_bulk \gset r7_
select is((:'r7_guests_bulk'::jsonb ->> 'changed')::int, 1, 'bulk restore restores a deleted guest');
select is((:'r7_guests_bulk'::jsonb -> 'previous' -> 0 ->> 'deleted')::boolean, true, 'previous remembers it was deleted');
select is((public.guests_bulk_undo(:'r7_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 1, 'undo of restore deletes it again');
select isnt((select deleted_at from public.guests where id = 'c1000000-0000-4000-8000-000000000005'), null, 'the guest is deleted again');

-- a guest hard-deleted meanwhile is skipped, no error
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000005']::uuid[], 'restore') as guests_bulk \gset r8_
select * from public.guests_bulk(array['c1000000-0000-4000-8000-000000000005']::uuid[], 'delete') as guests_bulk \gset r9_
delete from public.guests where id = 'c1000000-0000-4000-8000-000000000005';
select is((public.guests_bulk_undo(:'r9_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 0, 'undo skips an id that no longer exists');

-- malformed undo payloads
select throws_ok($$select public.guests_bulk_undo('{}')$$, 'P0001', 'invalid_previous', 'undo: not an array');
select throws_ok($$select public.guests_bulk_undo(null)$$, 'P0001', 'invalid_previous', 'undo: null');
select throws_ok($$select public.guests_bulk_undo('[{"id":"c1000000-0000-4000-8000-000000000001","op":"nuke"}]')$$, 'P0001', 'invalid_previous', 'undo: unknown op');
select throws_ok($$select public.guests_bulk_undo('[{"id":"not-a-uuid","op":"delete"}]')$$, 'P0001', 'invalid_previous', 'undo: bad id');
select throws_ok($$select public.guests_bulk_undo('["x"]')$$, 'P0001', 'invalid_previous', 'undo: element is not an object');
select is((public.guests_bulk_undo('[]') ->> 'restored')::int, 0, 'undo: an empty list restores nothing');
:su

-- Scale (REV-7): 1000 ids per call is the bound; the app batches larger selections, so there is no total cap.
insert into public.guests (wedding_id, first_name, import_batch_id)
select :'w1_wedding'::uuid, 'Bulk' || n, 'abcdef00-0000-4000-8000-000000000001' from generate_series(1, 1200) n;
select tests.login(:'w1_founder'::uuid);
select array_agg(id) as all_ids from public.guests where import_batch_id = 'abcdef00-0000-4000-8000-000000000001' \gset
select throws_ok(format($$select public.guests_bulk(%L::uuid[], 'delete')$$, :'all_ids'), 'P0001', 'invalid_ids', '1200 ids in one call are refused (the cap is per call)');
select array_agg(id) as ids_a from (select id from public.guests where import_batch_id = 'abcdef00-0000-4000-8000-000000000001' order by id limit 1000) x \gset
select array_agg(id) as ids_b from (select id from public.guests where import_batch_id = 'abcdef00-0000-4000-8000-000000000001' order by id offset 1000) x \gset
select public.guests_bulk(:'ids_a'::uuid[], 'delete') as guests_bulk \gset big_a_
select public.guests_bulk(:'ids_b'::uuid[], 'delete') as guests_bulk \gset big_b_
select is((:'big_a_guests_bulk'::jsonb ->> 'changed')::int + (:'big_b_guests_bulk'::jsonb ->> 'changed')::int, 1200, '1200 guests deleted in two batches (1000 + 200)');
select is((public.guests_bulk_undo(:'big_a_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 1000, 'undo of a 1000 batch');
select is((public.guests_bulk_undo(:'big_b_guests_bulk'::jsonb -> 'previous') ->> 'restored')::int, 200, 'undo of the 200 batch');
select is((select count(*)::int from public.guests where import_batch_id = 'abcdef00-0000-4000-8000-000000000001' and deleted_at is null), 1200, 'all 1200 are live again');
select throws_ok(format($$select public.guests_bulk_undo(%L::jsonb)$$, (select jsonb_agg(jsonb_build_object('id', id, 'op', 'delete', 'deleted', false)) from (select id from public.guests where import_batch_id = 'abcdef00-0000-4000-8000-000000000001' limit 1001) y)),
  'P0001', 'invalid_previous', 'undo: more than 1000 entries in one call are refused');
select throws_ok(format($$select public.create_guest_family('Grande', 'A', %L::jsonb)$$, (select jsonb_agg(jsonb_build_object('first_name', 'P' || n)) from generate_series(1, 101) n)),
  'P0001', 'too_many_rows', 'family: 101 people are refused');
select lives_ok(format($$select public.create_guest_family('Grande', 'A', %L::jsonb)$$, (select jsonb_agg(jsonb_build_object('first_name', 'P' || n)) from generate_series(1, 100) n)),
  'family: 100 people are accepted');
:su

-- ===== REV-6 / REV-9: the stored length is bounded too (padding), last_name has no blank ============
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat(' ', 100) || 'a'), '23514', null, 'first_name: padding + text above 80 stored chars refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, last_name) values (%L, 'A', %L)$$, :'w1_wedding'::uuid, repeat(' ', 100) || 'a'), '23514', null, 'last_name: padding refused');
select throws_ok(format($$insert into public.guest_groups (wedding_id, name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat(' ', 100) || 'a'), '23514', null, 'group name: padding refused');
select throws_ok(format($$insert into public.guest_tables (wedding_id, name) values (%L, %L)$$, :'w1_wedding'::uuid, repeat(' ', 100) || 'a'), '23514', null, 'table name: padding refused');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, last_name) values (%L, 'A', '')$$, :'w1_wedding'::uuid), '23514', null, 'last_name: empty string refused (the app stores null)');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, last_name) values (%L, 'A', '   ')$$, :'w1_wedding'::uuid), '23514', null, 'last_name: blank refused');
select lives_ok(format($$insert into public.guests (wedding_id, first_name, last_name) values (%L, 'A', null)$$, :'w1_wedding'::uuid), 'last_name: null ok');

-- ===== REV-5: fail-closed audit. A new column must be classified by its author ======================
-- columns minus the ones excluded from the audit == the structural allowlist. A personal column added
-- later (dietary, address...) fails here until it is added to the audit_row arguments AND classified.
select is(
  (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
   where a.attrelid = 'public.guests'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname::text <> all (array['first_name', 'last_name', 'phone', 'email', 'notes'])),
  array['category', 'created_at', 'created_by', 'deleted_at', 'deleted_by', 'group_id', 'id', 'import_batch_id',
        'side', 'table_id', 'updated_at', 'updated_by', 'version', 'wedding_id']::text[],
  'guests: the non-excluded columns are exactly the structural allowlist (a new column fails until classified)');
select is(
  (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
   where a.attrelid = 'public.guest_groups'::regclass and a.attnum > 0 and not a.attisdropped and a.attname::text <> 'name'),
  array['created_at', 'created_by', 'deleted_at', 'deleted_by', 'id', 'import_batch_id', 'updated_at', 'updated_by',
        'version', 'wedding_id']::text[],
  'guest_groups: the non-excluded columns are exactly the structural allowlist');
select is(
  (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
   where a.attrelid = 'public.guest_tables'::regclass and a.attnum > 0 and not a.attisdropped and a.attname::text <> 'name'),
  array['capacity', 'created_at', 'created_by', 'deleted_at', 'deleted_by', 'id', 'pos_x', 'pos_y', 'shape',
        'updated_at', 'updated_by', 'version', 'wedding_id']::text[],
  'guest_tables: the non-excluded columns are exactly the structural allowlist');
select is(
  (select array_agg(distinct x.arg order by x.arg) from pg_trigger t join pg_class c on c.oid = t.tgrelid
     cross join lateral unnest(string_to_array(encode(t.tgargs, 'escape'), '\000')) x(arg)
   where c.relname = 'guests' and t.tgname = 'guests_audit' and x.arg <> ''),
  array['email', 'first_name', 'last_name', 'notes', 'phone']::text[],
  'the guests audit trigger excludes exactly the five personal columns');

-- ===== No expiry (AC11): nothing purges soft-deleted rows ==========================================
insert into public.guests (id, wedding_id, first_name, deleted_at, deleted_by)
values ('99000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Vecchio', now() - interval '400 days', null);
select tests.login_service();
select lives_ok($$select public.job_recipients()$$, 'the daily job runs');
:su
select is((select count(*)::int from public.guests where id = '99000000-0000-4000-8000-000000000001'), 1, 'a guest deleted 400 days ago survives the daily job');
select is(
  (select count(*)::int from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and p.prosrc ~* 'delete\s+from\s+(public\.)?guest'),
  0, 'no function purges guests, groups or tables: only the user''s "Elimina definitivamente" deletes');

-- ===== REV-10: the personal-key scan again, after EVERY section (undo, 1200 rows, families) =========
select cmp_ok((select count(*)::int from public.audit_log where table_name = 'guests'), '>', 2400, 'the final audit scan is not vacuous (1200-row sections are in it)');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name in ('guests', 'guest_groups', 'guest_tables')
     and (coalesce(a.old_data, '{}'::jsonb) ?| array['first_name', 'last_name', 'phone', 'email', 'notes', 'name']
       or coalesce(a.new_data, '{}'::jsonb) ?| array['first_name', 'last_name', 'phone', 'email', 'notes', 'name'])),
  0, 'at the end of the file: still no personal key in any audit row of the three tables');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name in ('guests', 'guest_groups', 'guest_tables')
     and (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '')) ~* 'zed|zeta|segretissim|example\.test|\+39 000|Bulk[0-9]|Nuovo|Famiglia'),
  0, 'at the end of the file: no personal value in any audit row');

select * from finish();
rollback;
