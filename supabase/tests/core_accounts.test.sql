-- T2: account operations (AC5, AC6, AC46, AC57, AC58): authorize_account_op, record_account_event,
-- update_partner_email, sync_my_email.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(30);

select * from tests.make_wedding('a1') \gset w1_
select * from tests.make_wedding('a2') \gset w2_
select tests.make_user('a1.b@example.test') as b1 \gset
select tests.make_user('a.stranger@example.test') as stranger \gset

select tests.login(:'w1_founder'::uuid);
select public.upsert_partner_b('a1.b@example.test', 'Bea', 'Prova', null) \gset
select public.create_invitation('a1.b@example.test', 'code', :'b1'::uuid) \gset

-- authorize_account_op: pending B
select is((public.authorize_account_op('create_partner', 'B') ->> 'allowed')::boolean, true, 'create_partner allowed (B free/pending)');
select is((public.authorize_account_op('create_partner', 'B') ->> 'target_user_id')::uuid, :'b1'::uuid, 'target is the pending invitee');
select is(public.authorize_account_op('create_partner', 'A') ->> 'error', 'invalid_slot', 'create_partner only for B');
select is((public.authorize_account_op('update_pending_email', 'B') ->> 'allowed')::boolean, true, 'update_pending_email allowed before first access');
select is((public.authorize_account_op('delete_pending', 'B') ->> 'allowed')::boolean, true, 'delete_pending allowed before first access');
select is((public.authorize_account_op('set_temp_code', 'B') ->> 'target_email'), 'a1.b@example.test', 'temp code targets the other partner');
select is(public.authorize_account_op('set_temp_code', 'A') ->> 'error', 'self_target', 'temp code never on yourself');
select is(public.authorize_account_op('bogus', null) ->> 'error', 'unknown_op', 'unknown op refused');
select is((public.authorize_account_op('change_own_email') ->> 'target_user_id')::uuid, :'w1_founder'::uuid, 'change_own_email targets self');

-- non partner and other wedding
:su
select tests.login(:'stranger'::uuid);
select is(public.authorize_account_op('create_partner', 'B') ->> 'error', 'not_partner', 'non member refused');
select throws_ok($$select public.record_account_event('temp_code_set', null)$$, '42501', 'forbidden', 'non member cannot record events');
select throws_ok($$select public.update_partner_email('B', 'a.x@example.test')$$, '42501', 'forbidden', 'non member cannot change B email');
:su
select tests.login(:'w2_founder'::uuid);
select throws_ok(format($$select public.record_account_event('temp_code_set', %L)$$, :'b1'::uuid),
  'P0001', 'invalid_target', 'temp code event never cross-wedding');

-- update_partner_email before first access
:su
select tests.login(:'w1_founder'::uuid);
select throws_ok($$select public.update_partner_email('A', 'a1.x@example.test')$$, 'P0001', 'invalid_slot', 'only slot B');
select throws_ok($$select public.update_partner_email('B', 'a1.a@example.test')$$, 'P0001', 'same_email', 'not equal to A');
select lives_ok($$select public.update_partner_email('B', 'a1.b2@example.test')$$, 'pending B email updated');
select is((select email::text from public.invitations where accepted_at is null and revoked_at is null), 'a1.b2@example.test', 'pending invitation follows');
select lives_ok($$select public.update_partner_email('B', 'a1.b@example.test')$$, 'and back');

-- events
select lives_ok(format($$select public.record_account_event('partner_account_created', %L)$$, :'b1'::uuid), 'partner_account_created event');
select throws_ok(format($$select public.record_account_event('temp_code_set', %L)$$, :'w1_founder'::uuid),
  'P0001', 'invalid_target', 'temp_code_set on yourself refused');
select throws_ok($$select public.record_account_event('code_changed', '00000000-0000-4000-8000-0000000000ff')$$,
  'P0001', 'invalid_target', 'code_changed is about the caller');
select throws_ok($$select public.record_account_event('whatever', null)$$, 'P0001', 'invalid_kind', 'unknown kind refused');
select lives_ok($$select public.record_account_event('code_changed')$$, 'code_changed event');
select is((select count(*)::int from public.account_events), 2, 'RLS: events of my wedding are visible');
select throws_ok($$update public.account_events set kind = 'temp_code_set'$$, '42501', null, 'no UPDATE grant on account_events');

-- B enters, then A cannot touch B's email any more
:su
select tests.login(:'b1'::uuid);
select is(public.accept_pending_invitation(), 'ok', 'B enters');
:su
select tests.login(:'w1_founder'::uuid);
select is(public.authorize_account_op('update_pending_email', 'B') ->> 'error', 'partner_already_joined', 'B entered: email no longer editable by A');
select throws_ok($$select public.update_partner_email('B', 'a1.z@example.test')$$, 'P0001', 'partner_already_joined', 'RPC refuses as well');

-- sync_my_email follows the Auth account
:su
update auth.users set email = 'a1.b.new@example.test' where id = :'b1'::uuid;
select tests.login(:'b1'::uuid);
select is(public.sync_my_email(), 'a1.b.new@example.test', 'sync_my_email returns the new email');
select is((select email::text from public.wedding_partners where user_id = :'b1'::uuid), 'a1.b.new@example.test', 'own partner row aligned');

select * from finish();
rollback;
