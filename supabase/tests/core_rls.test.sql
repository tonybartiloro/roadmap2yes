-- T2: RLS isolation (AC10, AC11), direct-write matrix 3.1 for the core tables, triggers
-- (versioning, guard_row, audit append-only), roles without permissions.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(33);

select * from tests.make_wedding('r1') \gset w1_
select * from tests.make_wedding('r2') \gset w2_
select tests.make_user('r.family@example.test') as fam \gset

-- anonymous: nothing
select tests.login_anon();
select throws_ok($$select * from public.weddings$$, '42501', null, 'anon: no SELECT on weddings');
select throws_ok($$select public.create_wedding()$$, '42501', null, 'anon: no EXECUTE on create_wedding');
:su

-- isolation
select tests.login(:'w1_founder'::uuid);
select is((select count(*)::int from public.weddings), 1, 'sees only own wedding');
select is((select count(*)::int from public.wedding_partners), 1, 'sees only own partners');
select is((select count(*)::int from public.memberships), 1, 'sees only own memberships');
select is((select count(*)::int from public.audit_log where wedding_id = :'w2_wedding'::uuid), 0, 'no foreign audit rows');
select is((select count(*)::int from public.user_wedding_state), 0, 'no state yet');

-- cross-wedding writes
update public.weddings set rite = 'civile' where id = :'w2_wedding'::uuid;
select is((select count(*)::int from public.weddings where rite = 'civile'), 0, 'UPDATE on a foreign wedding affects nothing');
select throws_ok(format($$update public.weddings set id = %L where id = %L$$, gen_random_uuid(), :'w1_wedding'::uuid),
  '42501', null, 'id is not updatable');
select throws_ok($$update public.weddings set version = 99$$, '42501', null, 'version is not updatable');
select throws_ok($$update public.weddings set applied_reference_date = current_date$$, '42501', null, 'applied_reference_date is not updatable');
select throws_ok($$update public.weddings set onboarding_completed_at = now()$$, '42501', null, 'onboarding_completed_at is not updatable');
select throws_ok($$update public.wedding_partners set email = 'r.hack@example.test'$$, '42501', null, 'partner email is not directly updatable');
select throws_ok(format($$update public.wedding_partners set wedding_id = %L$$, :'w2_wedding'::uuid), '42501', null, 'wedding_id is not updatable');
select throws_ok($$insert into public.memberships (wedding_id, user_id, role, partner_slot) values (gen_random_uuid(), gen_random_uuid(), 'partner', 'B')$$,
  '42501', null, 'INSERT into memberships denied');
select throws_ok($$insert into public.weddings default values$$, '42501', null, 'INSERT into weddings denied');
select throws_ok($$delete from public.weddings$$, '42501', null, 'DELETE on weddings denied');
select throws_ok($$insert into public.account_events (wedding_id, kind, actor_id) values (gen_random_uuid(), 'code_changed', gen_random_uuid())$$,
  '42501', null, 'INSERT into account_events denied');
select throws_ok($$select * from public.invitations$$, '42501', null, 'select * on invitations is refused (token_hash)');
select throws_ok($$select * from public.heartbeats$$, '42501', null, 'heartbeats not readable');
select throws_ok($$select * from private.login_attempts$$, '42501', null, 'private schema not reachable');

-- allowed direct writes + versioning
select lives_ok($$update public.weddings set rite = 'simbolico', theme_id = 'giardino'$$, 'allowed columns of weddings');
select is((select version from public.weddings), 2, 'version bumped by trigger');
select is((select updated_by from public.weddings), :'w1_founder'::uuid, 'updated_by is the caller');
select lives_ok($$update public.wedding_partners set label = 'sposo', first_name = 'Anna', last_name = 'Demo'$$, 'partner names/label editable');
select throws_ok($$update public.weddings set rite = 'barbecue'$$, '23514', null, 'check constraint on rite');

-- audit
:su
select is((select count(*)::int from public.audit_log where table_name = 'weddings' and op = 'UPDATE' and wedding_id = :'w1_wedding'::uuid),
  1, 'audit row for the wedding update');
select is((select old_data ->> 'rite' from public.audit_log where table_name = 'weddings' and op = 'UPDATE' and wedding_id = :'w1_wedding'::uuid),
  null, 'audit keeps before/after (old rite null)');
select throws_ok($$update public.audit_log set op = 'INSERT'$$, '23000', 'append_only', 'audit_log UPDATE refused even for the owner');
select throws_ok($$delete from public.audit_log$$, '23000', 'append_only', 'audit_log DELETE refused');
select tests.login_service();
select throws_ok($$delete from public.audit_log$$, '23000', 'append_only', 'audit_log DELETE refused with the secret key');
select throws_ok($$truncate public.account_events$$, '23000', 'append_only', 'account_events TRUNCATE refused');
:su

-- family has no permission rows: reads nothing
insert into public.memberships (wedding_id, user_id, role) values (:'w1_wedding'::uuid, :'fam'::uuid, 'family');
select tests.login(:'fam'::uuid);
select is((select count(*)::int from public.weddings) + (select count(*)::int from public.wedding_partners)
  + (select count(*)::int from public.memberships), 0, 'family role without permission rows reads nothing');

select * from finish();
rollback;
