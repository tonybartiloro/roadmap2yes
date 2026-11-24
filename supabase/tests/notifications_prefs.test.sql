-- T9: notification preferences (AC52: each user decides for themselves) and the lock-down of
-- notification_log and job_* (secret key only).
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(22);

select * from tests.make_wedding('np1') \gset w1_
select * from tests.make_wedding('np2') \gset w2_
select tests.make_user('np1.b@example.test') as b1 \gset
insert into public.wedding_partners (wedding_id, slot, email, user_id) values (:'w1_wedding'::uuid, 'B', 'np1.b@example.test', :'b1'::uuid);
insert into public.memberships (wedding_id, user_id, role, partner_slot) values (:'w1_wedding'::uuid, :'b1'::uuid, 'partner', 'B');

-- anon
select tests.login_anon();
select throws_ok($$select * from public.notification_preferences$$, '42501', null, 'anon: no access to preferences');
:su

-- A: own row only
select tests.login(:'w1_founder'::uuid);
select is((select count(*)::int from public.notification_preferences), 0, 'no row = defaults (nothing stored)');
select lives_ok(format($$insert into public.notification_preferences (user_id, wedding_id, digest_enabled) values (%L, %L, false)$$, :'w1_founder'::uuid, :'w1_wedding'::uuid),
  'A inserts own preferences');
select is((select reminders_enabled from public.notification_preferences), true, 'reminders default on');
select is((select digest_enabled from public.notification_preferences), false, 'digest switched off');
select throws_ok(format($$insert into public.notification_preferences (user_id, wedding_id) values (%L, %L)$$, :'b1'::uuid, :'w1_wedding'::uuid),
  '42501', null, 'A cannot create a row for B');
select throws_ok(format($$insert into public.notification_preferences (user_id, wedding_id) values (%L, %L)$$, :'w1_founder'::uuid, :'w2_wedding'::uuid),
  '42501', null, 'cannot create a row for a foreign wedding');
select lives_ok($$update public.notification_preferences set reminders_enabled = false$$, 'A updates own switches');
select throws_ok(format($$update public.notification_preferences set user_id = %L$$, :'b1'::uuid), '42501', null, 'user_id is not updatable');
select throws_ok(format($$update public.notification_preferences set wedding_id = %L$$, :'w2_wedding'::uuid), '42501', null, 'wedding_id is not updatable');
select throws_ok($$delete from public.notification_preferences$$, '42501', null, 'no DELETE');
:su

-- B: cannot see or change A's row, has own
select tests.login(:'b1'::uuid);
select is((select count(*)::int from public.notification_preferences), 0, 'B does not see A''s preferences');
update public.notification_preferences set reminders_enabled = true;
select lives_ok(format($$insert into public.notification_preferences (user_id, wedding_id) values (%L, %L)$$, :'b1'::uuid, :'w1_wedding'::uuid),
  'B inserts own preferences');
select is((select count(*)::int from public.notification_preferences), 1, 'B sees only own row');
:su
select is((select reminders_enabled from public.notification_preferences where user_id = :'w1_founder'::uuid), false,
  'B''s update did not touch A''s row');

-- a user of another wedding sees nothing
select tests.login(:'w2_founder'::uuid);
select is((select count(*)::int from public.notification_preferences), 0, 'other wedding sees nothing');
:su

-- notification_log: no API access at all
select tests.login(:'w1_founder'::uuid);
select throws_ok($$select * from public.notification_log$$, '42501', null, 'authenticated cannot read notification_log');
select throws_ok(format($$insert into public.notification_log (wedding_id, user_id, kind, batch_key, status) values (%L, %L, 'reminder', 'k', 'skipped_quota')$$, :'w1_wedding'::uuid, :'w1_founder'::uuid),
  '42501', null, 'authenticated cannot write notification_log');
select throws_ok($$select public.job_recipients()$$, '42501', null, 'authenticated cannot execute job_recipients');
select throws_ok(format($$select public.job_unsubscribe(%L, 'reminders')$$, :'b1'::uuid), '42501', null, 'authenticated cannot execute job_unsubscribe');
:su
select tests.login_anon();
select throws_ok($$select public.job_quota_status()$$, '42501', null, 'anon cannot execute job_quota_status');
:su
select tests.login_service();
select lives_ok($$select * from public.job_recipients()$$, 'secret key can execute job functions');

select * from finish();
rollback;
