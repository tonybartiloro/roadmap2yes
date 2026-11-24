-- T9: categories (delete only when empty, "Sposta in..." resets Assegnato: AC34, D37), items (AC35),
-- payments (AC36), cents checks (AC38), column grants and cross-wedding isolation (matrix 3.1).
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(47);

select * from tests.make_wedding('bc1') \gset w1_
select * from tests.make_wedding('bc2') \gset w2_
select tests.make_user('bc.stranger@example.test') as stranger \gset

-- fixtures as the table owner (ids fixed so the tests can talk about them)
insert into public.budget_categories (id, wedding_id, name, assigned_cents) values
  ('10000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Location', 800000),
  ('10000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'Catering', 900000),
  ('10000000-0000-4000-8000-000000000003', :'w2_wedding'::uuid, 'Altrui', 1);
insert into public.budget_items (id, wedding_id, category_id, description, status, planned_cents, agreed_cents) values
  ('20000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, '10000000-0000-4000-8000-000000000001', 'Villa', 'agreed', 700000, 750000),
  ('20000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, '10000000-0000-4000-8000-000000000001', 'Navetta', 'planned', 50000, null),
  ('20000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, '10000000-0000-4000-8000-000000000003', 'Altrui', 'planned', 1, null);

-- anon / stranger
select tests.login_anon();
select throws_ok($$select * from public.budget_categories$$, '42501', null, 'anon: no SELECT on categories');
select throws_ok($$select * from public.payments$$, '42501', null, 'anon: no SELECT on payments');
:su
select tests.login(:'stranger'::uuid);
select is((select count(*)::int from public.budget_categories), 0, 'non-member sees no categories');
select throws_ok(format($$insert into public.budget_categories (wedding_id, name) values (%L, 'X')$$, :'w1_wedding'::uuid),
  '42501', null, 'non-member cannot insert a category');
:su

select tests.login(:'w1_founder'::uuid);
select is((select count(*)::int from public.budget_categories), 2, 'member sees own categories only');
select is((select count(*)::int from public.budget_items), 2, 'member sees own items only');

-- categories: insert / update / grants
select lives_ok(format($$insert into public.budget_categories (wedding_id, name, default_key, assigned_cents, sort_order) values (%L, 'Fiori', 'fiori-allestimento', null, 3)$$, :'w1_wedding'::uuid),
  'insert a category (assigned = null = non assegnato)');
select throws_ok(format($$insert into public.budget_categories (wedding_id, name, default_key) values (%L, 'Fiori 2', 'fiori-allestimento')$$, :'w1_wedding'::uuid),
  '23505', null, 'predefined key is unique per wedding (idempotent seeding)');
select throws_ok(format($$insert into public.budget_categories (wedding_id, name, assigned_cents) values (%L, 'Neg', -1)$$, :'w1_wedding'::uuid),
  '23514', null, 'negative Assegnato refused (AC38)');
select throws_ok(format($$insert into public.budget_categories (wedding_id, name, assigned_cents) values (%L, 'Big', 100000000001)$$, :'w1_wedding'::uuid),
  '23514', null, 'Assegnato above the cap refused');
select throws_ok(format($$insert into public.budget_categories (wedding_id, name) values (%L, '   ')$$, :'w1_wedding'::uuid),
  '23514', null, 'blank name refused');
select throws_ok(format($$insert into public.budget_categories (wedding_id, name) values (%L, 'Altrui')$$, :'w2_wedding'::uuid),
  '42501', null, 'cannot insert into a foreign wedding');
select lives_ok($$update public.budget_categories set name = 'Sala', assigned_cents = 850000 where id = '10000000-0000-4000-8000-000000000001'$$,
  'rename and assign');
select is((select version from public.budget_categories where id = '10000000-0000-4000-8000-000000000001'), 2, 'version bumped');
select throws_ok($$update public.budget_categories set version = 9 where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'version is not writable');
select throws_ok($$update public.budget_categories set default_key = 'x' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'default_key is not updatable');
select throws_ok(format($$update public.budget_categories set wedding_id = %L where id = '10000000-0000-4000-8000-000000000001'$$, :'w2_wedding'::uuid),
  '42501', null, 'wedding_id is not updatable');
update public.budget_categories set name = 'Hack' where id = '10000000-0000-4000-8000-000000000003';
select is((select name from public.budget_categories where id = '10000000-0000-4000-8000-000000000003'), null, 'foreign category not visible/updatable');
select throws_ok($$delete from public.budget_categories$$, '42501', null, 'no hard DELETE for authenticated');

-- P5: not deletable while it has items
select throws_ok($$update public.budget_categories set deleted_at = now() where id = '10000000-0000-4000-8000-000000000001'$$,
  'P0001', 'category_not_empty', 'category with items cannot be deleted');
select lives_ok($$update public.budget_categories set deleted_at = now() where default_key = 'fiori-allestimento'$$,
  'empty category can be deleted (soft)');
select lives_ok($$update public.budget_categories set deleted_at = null where default_key = 'fiori-allestimento'$$,
  'Annulla: deleted category can be restored');
select lives_ok($$update public.budget_categories set deleted_at = now() where default_key = 'fiori-allestimento'$$, 'delete again');
select throws_ok(format($$insert into public.budget_items (wedding_id, category_id, description) values (%L, (select id from public.budget_categories where default_key = 'fiori-allestimento'), 'Rose')$$, :'w1_wedding'::uuid),
  'P0001', 'category_deleted', 'cannot add an item to a deleted category');

-- items
select lives_ok(format($$insert into public.budget_items (wedding_id, category_id, description, status, planned_cents, agreed_cents) values (%L, '10000000-0000-4000-8000-000000000002', 'Menu', 'agreed', 850000, 900000)$$, :'w1_wedding'::uuid),
  'insert an item');
select throws_ok(format($$insert into public.budget_items (wedding_id, category_id, description) values (%L, '10000000-0000-4000-8000-000000000003', 'Cross')$$, :'w1_wedding'::uuid),
  '23503', null, 'composite FK: item cannot point to a category of another wedding');
select throws_ok(format($$insert into public.budget_items (wedding_id, category_id, description, planned_cents) values (%L, '10000000-0000-4000-8000-000000000002', 'Neg', -5)$$, :'w1_wedding'::uuid),
  '23514', null, 'negative planned refused');
select throws_ok(format($$insert into public.budget_items (wedding_id, category_id, description, agreed_cents) values (%L, '10000000-0000-4000-8000-000000000002', 'Big', 100000000001)$$, :'w1_wedding'::uuid),
  '23514', null, 'agreed above the cap refused');
select throws_ok(format($$insert into public.budget_items (wedding_id, category_id, description, status) values (%L, '10000000-0000-4000-8000-000000000002', 'Bad', 'done')$$, :'w1_wedding'::uuid),
  '23514', null, 'status must be planned|agreed|cancelled');
select throws_ok($$update public.budget_items set category_id = '10000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'category_id is not directly updatable (move goes through the RPC)');
select lives_ok($$update public.budget_items set status = 'cancelled', agreed_cents = null where id = '20000000-0000-4000-8000-000000000002'$$,
  'update business columns');

-- payments
select lives_ok(format($$insert into public.payments (wedding_id, item_id, kind, amount_cents, due_date) values (%L, '20000000-0000-4000-8000-000000000001', 'deposit', 200000, '2027-01-10')$$, :'w1_wedding'::uuid),
  'insert a payment');
select throws_ok(format($$insert into public.payments (wedding_id, item_id, amount_cents) values (%L, '20000000-0000-4000-8000-000000000001', -1)$$, :'w1_wedding'::uuid),
  '23514', null, 'negative payment refused (AC38)');
select throws_ok(format($$insert into public.payments (wedding_id, item_id, amount_cents) values (%L, '20000000-0000-4000-8000-000000000001', 100000000001)$$, :'w1_wedding'::uuid),
  '23514', null, 'payment above the cap refused');
select throws_ok(format($$insert into public.payments (wedding_id, item_id, amount_cents, paid, paid_on) values (%L, '20000000-0000-4000-8000-000000000001', 5, false, '2027-01-01')$$, :'w1_wedding'::uuid),
  '23514', null, 'paid_on only for paid payments');
select throws_ok(format($$insert into public.payments (wedding_id, item_id, amount_cents) values (%L, '20000000-0000-4000-8000-000000000009', 5)$$, :'w1_wedding'::uuid),
  '23503', null, 'composite FK: payment cannot point to an item of another wedding');
select lives_ok($$update public.payments set paid = true, paid_on = '2027-01-09'$$, 'mark a payment as paid');
select throws_ok($$update public.payments set item_id = '20000000-0000-4000-8000-000000000002'$$, '42501', null, 'item_id is not updatable');

-- "Sposta in...": items move, Assegnato of the source returns to null (D37)
select throws_ok($$select public.move_budget_items('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  'P0001', 'same_category', 'cannot move into the same category');
select throws_ok($$select public.move_budget_items('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003')$$,
  'P0001', 'category_not_found', 'cannot move into a foreign category');
select throws_ok($$select public.move_budget_items('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'cannot move out of a foreign category');
select is(public.move_budget_items('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'), 2,
  'moves the 2 live items');
select is((select assigned_cents from public.budget_categories where id = '10000000-0000-4000-8000-000000000001'), null,
  'source Assegnato is back to non assegnato');
select is((select assigned_cents from public.budget_categories where id = '10000000-0000-4000-8000-000000000002'), 900000::bigint,
  'target Assegnato is untouched');
select lives_ok($$update public.budget_categories set deleted_at = now() where id = '10000000-0000-4000-8000-000000000001'$$,
  'now the emptied category can be deleted');

:su
select is((select count(*)::int from public.audit_log where table_name = 'budget_categories' and op = 'UPDATE' and wedding_id = :'w1_wedding'::uuid) > 0, true,
  'category changes are audited');
select tests.login_anon();
select throws_ok(format($$select public.move_budget_items(%L, %L)$$, gen_random_uuid(), gen_random_uuid()), '42501', null, 'anon cannot execute move_budget_items');
:su

select * from finish();
rollback;
