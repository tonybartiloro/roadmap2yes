-- T9: budget total as versions (AC33): append-only, author, reason, cents checks (AC38), isolation.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(22);

select * from tests.make_wedding('bv1') \gset w1_
select * from tests.make_wedding('bv2') \gset w2_
select tests.make_user('bv.stranger@example.test') as stranger \gset

-- anonymous and strangers
select tests.login_anon();
select throws_ok($$select * from public.budget_versions$$, '42501', null, 'anon: no SELECT on budget_versions');
:su
select tests.login(:'stranger'::uuid);
select is((select count(*)::int from public.budget_versions), 0, 'non-member sees no versions');
select throws_ok(format($$insert into public.budget_versions (wedding_id, total_cents) values (%L, 100)$$, :'w1_wedding'::uuid),
  '42501', null, 'non-member cannot insert a version');
:su

-- write
select tests.login(:'w1_founder'::uuid);
select lives_ok(format($$insert into public.budget_versions (wedding_id, total_cents, reason) values (%L, 2000000, 'Prima stima')$$, :'w1_wedding'::uuid),
  'partner inserts a version');
select is((select created_by from public.budget_versions), :'w1_founder'::uuid, 'author is stamped from the session');
select ok((select created_at from public.budget_versions) is not null, 'date is stamped');
select throws_ok(format($$insert into public.budget_versions (wedding_id, total_cents, created_by) values (%L, 5, %L)$$, :'w1_wedding'::uuid, gen_random_uuid()),
  '42501', null, 'author cannot be supplied by the client');
select lives_ok(format($$insert into public.budget_versions (wedding_id, total_cents) values (%L, 0)$$, :'w1_wedding'::uuid), 'zero is a valid total');
select lives_ok(format($$insert into public.budget_versions (wedding_id, total_cents) values (%L, 100000000000)$$, :'w1_wedding'::uuid),
  'cap (1 billion euro = 100000000000 cents) is accepted');
select throws_ok(format($$insert into public.budget_versions (wedding_id, total_cents) values (%L, 100000000001)$$, :'w1_wedding'::uuid),
  '23514', null, 'above the cap is refused');
select throws_ok(format($$insert into public.budget_versions (wedding_id, total_cents) values (%L, -1)$$, :'w1_wedding'::uuid),
  '23514', null, 'negative total is refused (AC38)');
select throws_ok(format($$insert into public.budget_versions (wedding_id, total_cents, reason) values (%L, 1, %L)$$, :'w1_wedding'::uuid, repeat('x', 301)),
  '23514', null, 'reason is capped at 300 characters');
select throws_ok(format($$insert into public.budget_versions (wedding_id, total_cents) values (%L, 100)$$, :'w2_wedding'::uuid),
  '42501', null, 'cannot write versions of a foreign wedding');

-- append-only, even for the owner and the secret key
select throws_ok($$update public.budget_versions set total_cents = 1$$, '42501', null, 'authenticated cannot UPDATE');
select throws_ok($$delete from public.budget_versions$$, '42501', null, 'authenticated cannot DELETE');
:su
select throws_ok($$update public.budget_versions set total_cents = 1$$, '23000', 'append_only', 'UPDATE refused even for the table owner');
select throws_ok($$delete from public.budget_versions$$, '23000', 'append_only', 'DELETE refused even for the table owner');
select tests.login_service();
select throws_ok($$delete from public.budget_versions$$, '23000', 'append_only', 'DELETE refused for the secret key');
select throws_ok($$truncate public.budget_versions$$, '23000', 'append_only', 'TRUNCATE refused');
:su

-- REV-4: versions written in one transaction still order by their stamped instants
select is((select total_cents from public.budget_versions where wedding_id = :'w1_wedding'::uuid order by created_at desc, id desc limit 1),
  100000000000::bigint, 'latest version = last inserted, even inside one transaction');

-- isolation + audit
select tests.login(:'w2_founder'::uuid);
select is((select count(*)::int from public.budget_versions), 0, 'other wedding sees none of them');
:su
select is((select count(*)::int from public.audit_log where table_name = 'budget_versions' and wedding_id = :'w1_wedding'::uuid), 3,
  'every version is audited');

select * from finish();
rollback;
