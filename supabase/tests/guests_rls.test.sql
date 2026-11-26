-- FEAT-2026-003 / T1: guests, guest_groups, guest_tables - permissions, RLS, grants, DELETE only on
-- soft-deleted rows, RPC execute and denials (AC13, BR5, BR8, ADR-0002). All emails are FAKE.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(72);

select * from tests.make_wedding('gr1') \gset w1_
select * from tests.make_wedding('gr2') \gset w2_
select tests.make_user('gr.stranger@example.test') as stranger \gset
select tests.make_user('gr.family@example.test') as fam \gset
select tests.make_user('gr.planner@example.test') as plan_user \gset
insert into public.memberships (wedding_id, user_id, role) values
  (:'w1_wedding'::uuid, :'fam'::uuid, 'family'),
  (:'w1_wedding'::uuid, :'plan_user'::uuid, 'planner');

-- Fixtures as the owner. W1: live and deleted group/table/guest, plus a member of a deleted group
-- (the pointer is kept). W2: one live row each.
insert into public.guest_groups (id, wedding_id, name) values
  ('a0000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Famiglia Prova'),
  ('a0000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'Gruppo da eliminare'),
  ('a0000000-0000-4000-8000-000000000003', :'w2_wedding'::uuid, 'Altrui');
insert into public.guest_tables (id, wedding_id, name, capacity) values
  ('b0000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Tavolo 1', 8),
  ('b0000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'Tavolo da eliminare', 8),
  ('b0000000-0000-4000-8000-000000000003', :'w2_wedding'::uuid, 'Tavolo altrui', 8);
insert into public.guests (id, wedding_id, first_name, group_id, table_id) values
  ('c0000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Mario', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'Eliminato', null, null),
  ('c0000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, 'Membro', 'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'Altrui', 'a0000000-0000-4000-8000-000000000003', null);
update public.guests set deleted_at = now() where id = 'c0000000-0000-4000-8000-000000000002';
update public.guest_groups set deleted_at = now() where id = 'a0000000-0000-4000-8000-000000000002';
update public.guest_tables set deleted_at = now() where id = 'b0000000-0000-4000-8000-000000000002';

-- ===== Permissions (BR8) ===========================================================================
select is(
  (select array_agg(role || ':' || action order by role, action) from private.role_permissions where area = 'guests'),
  array['partner:delete', 'partner:read', 'partner:write']::text[], 'area guests: only partner, with read, write and delete');
select throws_ok($$insert into private.role_permissions (role, area, action) values ('partner', 'x', 'purge')$$,
  '23514', null, 'the action check allows only read, write, delete');
select ok(public.has_permission(:'w1_wedding'::uuid, 'guests', 'delete') is false, 'owner session (no auth.uid) has no permission');
select tests.login(:'w1_founder'::uuid);
select ok(public.has_permission(:'w1_wedding'::uuid, 'guests', 'delete'), 'partner has guests/delete');
select ok(public.has_permission(:'w1_wedding'::uuid, 'guests', 'write'), 'partner has guests/write');
:su
select tests.login(:'fam'::uuid);
select ok(not public.has_permission(:'w1_wedding'::uuid, 'guests', 'read'), 'family has no guests/read');
:su
select tests.login(:'plan_user'::uuid);
select ok(not public.has_permission(:'w1_wedding'::uuid, 'guests', 'delete'), 'planner has no guests/delete');
:su

-- ===== anon: nothing, on any of the three tables ==================================================
select tests.login_anon();
select throws_ok(format($$select * from public.%I$$, t), '42501', null, 'anon: no SELECT on ' || t)
  from unnest(array['guests', 'guest_groups', 'guest_tables']) t;
select throws_ok(format($$insert into public.%I (wedding_id) values (%L)$$, t, :'w1_wedding'::uuid), '42501', null, 'anon: no INSERT on ' || t)
  from unnest(array['guests', 'guest_groups', 'guest_tables']) t;
select throws_ok(format($$update public.%I set version = version$$, t), '42501', null, 'anon: no UPDATE on ' || t)
  from unnest(array['guests', 'guest_groups', 'guest_tables']) t;
select throws_ok(format($$delete from public.%I$$, t), '42501', null, 'anon: no DELETE on ' || t)
  from unnest(array['guests', 'guest_groups', 'guest_tables']) t;
:su

-- ===== stranger, family, planner, member of another wedding: read nothing, write nothing ============
select tests.login(:'stranger'::uuid);
select is((select count(*)::int from public.guests), 0, 'no membership: no guests');
select is((select count(*)::int from public.guest_groups) + (select count(*)::int from public.guest_tables), 0, 'no membership: no groups, no tables');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, 'X')$$, :'w1_wedding'::uuid),
  '42501', null, 'no membership: cannot insert a guest into W1');
with d as (delete from public.guests where wedding_id = :'w1_wedding'::uuid returning 1) select count(*) as n from d \gset st_
:su
select is(:st_n::int, 0, 'no membership: DELETE touches nothing');

select tests.login(:'fam'::uuid);
select is((select count(*)::int from public.guests), 0, 'family: no guests');
select is((select count(*)::int from public.guest_groups) + (select count(*)::int from public.guest_tables), 0, 'family: no groups, no tables');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, 'X')$$, :'w1_wedding'::uuid),
  '42501', null, 'family: cannot insert a guest');
select throws_ok(format($$insert into public.guest_groups (wedding_id, name) values (%L, 'X')$$, :'w1_wedding'::uuid),
  '42501', null, 'family: cannot insert a group');
select throws_ok(format($$insert into public.guest_tables (wedding_id, name) values (%L, 'X')$$, :'w1_wedding'::uuid),
  '42501', null, 'family: cannot insert a table');
with u as (update public.guests set first_name = 'Hack' where wedding_id = :'w1_wedding'::uuid returning 1) select count(*) as n from u \gset fa_u_
with d as (delete from public.guests where wedding_id = :'w1_wedding'::uuid returning 1) select count(*) as n from d \gset fa_d_
:su
select is(:fa_u_n::int + :fa_d_n::int, 0, 'family: UPDATE and DELETE (even of deleted rows) touch nothing');

select tests.login(:'plan_user'::uuid);
select is((select count(*)::int from public.guests), 0, 'planner: no guests');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, 'X')$$, :'w1_wedding'::uuid),
  '42501', null, 'planner: cannot insert a guest');
:su

select tests.login(:'w2_founder'::uuid);
select is((select count(*)::int from public.guests where wedding_id = :'w1_wedding'::uuid), 0, 'other wedding: sees no guest of W1');
select is((select count(*)::int from public.guests), 1, 'other wedding: sees its own guest only');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, 'X')$$, :'w1_wedding'::uuid),
  '42501', null, 'other wedding: cannot insert into W1');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, group_id) values (%L, 'X', 'a0000000-0000-4000-8000-000000000001')$$, :'w2_wedding'::uuid),
  '23503', null, 'cannot hang a W2 guest from a W1 group (composite FK)');
select throws_ok(format($$insert into public.guests (wedding_id, first_name, table_id) values (%L, 'X', 'b0000000-0000-4000-8000-000000000001')$$, :'w2_wedding'::uuid),
  '23503', null, 'cannot hang a W2 guest from a W1 table (composite FK)');
with u as (update public.guests set first_name = 'Hack' where wedding_id = :'w1_wedding'::uuid returning 1) select count(*) as n from u \gset ow_u_
with d as (delete from public.guest_groups where id = 'a0000000-0000-4000-8000-000000000002' returning 1) select count(*) as n from d \gset ow_d_
:su
select is(:ow_u_n::int + :ow_d_n::int, 0, 'other wedding: UPDATE and DELETE (even of a deleted group) touch nothing');

-- ===== partner: write yes, hard DELETE only on soft-deleted rows ====================================
select tests.login(:'w1_founder'::uuid);
select is((select count(*)::int from public.guests), 3, 'partner sees the 3 guests of W1 (deleted ones included)');
select lives_ok(format($$insert into public.guest_groups (wedding_id, name) values (%L, 'Nuovo')$$, :'w1_wedding'::uuid), 'partner inserts a group');
select lives_ok(format($$insert into public.guest_tables (wedding_id, name, capacity, shape, pos_x, pos_y) values (%L, 'Nuovo', 10, 'rect', 1.5, 2.5)$$, :'w1_wedding'::uuid), 'partner inserts a table with shape and position');
select lives_ok(format($$insert into public.guests (wedding_id, first_name, side, group_id) values (%L, 'Nuovo', 'both', 'a0000000-0000-4000-8000-000000000001')$$, :'w1_wedding'::uuid), 'partner inserts a guest');
select throws_ok(format($$insert into public.guests (wedding_id, first_name) values (%L, 'X')$$, :'w2_wedding'::uuid),
  '42501', null, 'partner cannot insert into W2');
select throws_ok($$insert into public.guests (wedding_id, first_name, deleted_at) values ((select wedding_id from public.guests limit 1), 'X', now())$$,
  '42501', null, 'deleted_at is not insertable');
select throws_ok($$update public.guests set version = 9$$, '42501', null, 'version is not writable');
select throws_ok($$update public.guests set deleted_by = null$$, '42501', null, 'deleted_by is not writable');
select throws_ok($$update public.guests set import_batch_id = gen_random_uuid()$$, '42501', null, 'import_batch_id is not writable');
select throws_ok(format($$update public.guests set wedding_id = %L$$, :'w2_wedding'::uuid), '42501', null, 'wedding_id is not writable');

with d as (delete from public.guests where id = 'c0000000-0000-4000-8000-000000000001' returning 1) select count(*) as n from d \gset live_g_
with d as (delete from public.guest_groups where id = 'a0000000-0000-4000-8000-000000000001' returning 1) select count(*) as n from d \gset live_gg_
with d as (delete from public.guest_tables where id = 'b0000000-0000-4000-8000-000000000001' returning 1) select count(*) as n from d \gset live_gt_
select is(:live_g_n::int + :live_gg_n::int + :live_gt_n::int, 0, 'DELETE on live guest, group and table is refused by RLS (0 rows)');
select is((select count(*)::int from public.guests where id = 'c0000000-0000-4000-8000-000000000001'), 1, 'the live guest survives');

with d as (delete from public.guests where id = 'c0000000-0000-4000-8000-000000000002' returning 1) select count(*) as n from d \gset del_g_
select is(:del_g_n::int, 1, 'DELETE on a soft-deleted guest works (AC11)');
with d as (delete from public.guest_groups where id = 'a0000000-0000-4000-8000-000000000002' returning 1) select count(*) as n from d \gset del_gg_
select is(:del_gg_n::int, 1, 'DELETE on a soft-deleted group works');
select is((select group_id from public.guests where id = 'c0000000-0000-4000-8000-000000000003'), null,
  'the member of the deleted group is now "Senza gruppo" (FK set null)');
select is((select wedding_id from public.guests where id = 'c0000000-0000-4000-8000-000000000003'), :'w1_wedding'::uuid,
  'set null touched group_id only: wedding_id is intact');
with d as (delete from public.guest_tables where id = 'b0000000-0000-4000-8000-000000000002' returning 1) select count(*) as n from d \gset del_gt_
select is(:del_gt_n::int, 1, 'DELETE on a soft-deleted table works');
select is((select table_id from public.guests where id = 'c0000000-0000-4000-8000-000000000003'), null,
  'the member of the deleted table is now "Senza tavolo"');
:su

-- ===== RPC execute and denials =====================================================================
select is(
  (select array_agg(p.proname::text order by p.proname::text) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('create_guest_family', 'guests_bulk', 'guests_bulk_undo')
     and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')),
  array['create_guest_family', 'guests_bulk', 'guests_bulk_undo']::text[], 'the three RPCs: authenticated yes, anon no');
select is(
  (select array_agg(p.proname::text order by p.proname::text) from pg_proc p
   where p.pronamespace = 'private'::regnamespace and p.proname like 'guests\_%'
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  null, 'private guests trigger functions are not executable by API roles');
select is(
  (select array_agg(p.proname::text order by p.proname::text) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('guests_bulk', 'guests_bulk_undo') and p.prosecdef),
  null, 'bulk RPCs are SECURITY INVOKER (RLS and column grants apply)');

select tests.login(:'fam'::uuid);
select throws_ok($$select public.create_guest_family('F', null, '[{"first_name":"A"}]')$$, '42501', 'forbidden', 'family: create_guest_family denied');
select is((public.guests_bulk(array['c0000000-0000-4000-8000-000000000001']::uuid[], 'delete') ->> 'changed')::int, 0, 'family: guests_bulk changes nothing');
:su
select tests.login(:'stranger'::uuid);
select throws_ok($$select public.create_guest_family('F', null, '[{"first_name":"A"}]')$$, '42501', 'forbidden', 'no membership: create_guest_family denied');
:su
select tests.login(:'w2_founder'::uuid);
select is((public.guests_bulk(array['c0000000-0000-4000-8000-000000000001']::uuid[], 'delete') ->> 'changed')::int, 0, 'other wedding: guests_bulk on W1 ids changes nothing');
select is((public.guests_bulk_undo('[{"id":"c0000000-0000-4000-8000-000000000001","op":"delete","deleted":false}]') ->> 'restored')::int, 0, 'other wedding: guests_bulk_undo on W1 ids restores nothing');
:su
select tests.login_service();
select throws_ok($$select public.guests_bulk(array[gen_random_uuid()], 'delete')$$, '42501', 'forbidden', 'secret key (no auth.uid): guests_bulk refused, it would bypass RLS');
select throws_ok($$select public.guests_bulk_undo('[]')$$, '42501', 'forbidden', 'secret key: guests_bulk_undo refused');
select throws_ok($$select public.create_guest_family('F', null, '[]')$$, '42501', 'forbidden', 'secret key: create_guest_family refused');
:su
select is((select deleted_at from public.guests where id = 'c0000000-0000-4000-8000-000000000001'), null, 'W1 guest untouched by every attack above');

-- ===== Structure ==================================================================================
select is(
  (select array_agg(c.relname::text order by c.relname::text) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname in ('guests', 'guest_groups', 'guest_tables') and c.relrowsecurity),
  array['guest_groups', 'guest_tables', 'guests']::text[], 'RLS enabled on the three tables');
select is(
  (select count(*)::int from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname in ('guests', 'guest_groups', 'guest_tables') and p.polcmd = 'd'
     and pg_get_expr(p.polqual, p.polrelid) like '%deleted_at IS NOT NULL%'),
  3, 'the three DELETE policies require deleted_at is not null');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon' and table_name in ('guests', 'guest_groups', 'guest_tables')),
  0, 'anon has no grant on the three tables');
select is(
  (select count(*)::int from pg_attribute a where a.attrelid = 'public.guest_tables'::regclass and a.attname = 'sort_order'),
  0, 'guest_tables has no sort_order (BR10)');
select is(
  (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
   where a.attrelid = 'public.guest_tables'::regclass and a.attname in ('shape', 'pos_x', 'pos_y') and not a.attisdropped),
  array['pos_x', 'pos_y', 'shape']::text[], 'guest_tables stores shape and position for R-06 (BR10)');

select * from finish();
rollback;
