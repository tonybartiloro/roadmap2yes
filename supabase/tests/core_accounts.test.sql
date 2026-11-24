-- T2: account operations (AC5, AC6, AC46, AC57, AC58) under the DB -> admin contract (plan §4.8):
-- create_invitation / update_partner_email / revoke_invitation / authorize_account_op write their
-- own account event, return the only account the server may touch, and use ONE reusability
-- predicate. record_account_event is no longer callable; events cannot be forged.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(71);

select * from tests.make_wedding('a1') \gset w1_
select * from tests.make_wedding('a2') \gset w2_
select * from tests.make_wedding('a4') \gset w4_
select tests.make_user('a1.b@example.test') as b1 \gset
select tests.make_user('a2.b@example.test') as b2 \gset
select tests.make_user('a.stranger@example.test') as stranger \gset

-- ---- create_invitation: step 1 of "create B" -------------------------------------------------
select tests.login(:'w1_founder'::uuid);
select public.upsert_partner_b('a1.b@example.test', 'Bea', 'Prova', null) \gset
select public.create_invitation('a1.b@example.test', 'code')::text as inv1 \gset
select is((:'inv1'::jsonb ->> 'invitee_user_id')::uuid, :'b1'::uuid, 'existing reusable account comes back as invitee_user_id');
select is((select count(*)::int from public.account_events where kind = 'partner_account_created'
  and actor_id = :'w1_founder'::uuid and target_user_id = :'b1'::uuid), 1,
  'partner_account_created written by the DB, actor = caller, target = invitee');
select public.create_invitation('a1.b@example.test', 'code')::text as inv1b \gset
select is((select count(*)::int from public.account_events where kind = 'partner_account_created'), 2,
  're-delivery writes the event again');
select is((select send_count from public.invitations where id = (:'inv1'::jsonb ->> 'id')::uuid), 2, 'send_count 2 after re-delivery');

-- ---- authorize_account_op ---------------------------------------------------------------------
select is((public.authorize_account_op('set_temp_code', 'B') ->> 'target_user_id')::uuid, :'b1'::uuid,
  'set_temp_code targets the pending invitee while reusable');
select is((select count(*)::int from public.account_events where kind = 'temp_code_set'
  and actor_id = :'w1_founder'::uuid and target_user_id = :'b1'::uuid), 1, 'temp_code_set event written with the authorization');
select is(public.authorize_account_op('set_temp_code', 'A') ->> 'error', 'self_target', 'temp code never on yourself');
select is((select count(*)::int from public.account_events where kind = 'temp_code_set'), 1, 'a refused operation writes no event');
select is(public.authorize_account_op('create_partner', 'B') ->> 'error', 'unknown_op', 'create_partner moved to create_invitation');
select is(public.authorize_account_op('delete_pending', 'B') ->> 'error', 'unknown_op', 'delete_pending moved to revoke_invitation');
select is(public.authorize_account_op('bogus') ->> 'error', 'unknown_op', 'unknown op refused');

select is((public.authorize_account_op('change_own_code') ->> 'target_user_id')::uuid, :'w1_founder'::uuid, 'change_own_code targets the caller');
select is((select count(*)::int from public.account_events where kind = 'code_changed' and target_user_id = :'w1_founder'::uuid
  and actor_id = :'w1_founder'::uuid), 1, 'code_changed event');

select is(public.authorize_account_op('change_own_email', null, 'a1.a@example.test') ->> 'error', 'same_email', 'same email refused');
select is(public.authorize_account_op('change_own_email', null, 'a.stranger@example.test') ->> 'error', 'email_in_use', 'address of another Auth account refused');
select is(public.authorize_account_op('change_own_email', null, 'a1.b@example.test') ->> 'error', 'email_in_use', 'address of the other partner refused');
select throws_ok($$select public.authorize_account_op('change_own_email', null, 'nope')$$, 'P0001', 'invalid_email', 'invalid new email');
select is((select count(*)::int from public.account_events where kind = 'email_changed'), 0, 'no email event for refusals');
select is(public.authorize_account_op('change_own_email', null, 'A1.A.New@Example.test') ->> 'new_email', 'a1.a.new@example.test', 'new email normalized');
select is((select count(*)::int from public.account_events where kind = 'email_changed' and target_user_id = :'w1_founder'::uuid), 1, 'email_changed event');

-- non member
:su
select tests.login(:'stranger'::uuid);
select is(public.authorize_account_op('set_temp_code', 'B') ->> 'error', 'not_partner', 'non member refused');
select is(public.authorize_account_op('change_own_code') ->> 'error', 'not_partner', 'non member cannot record a code change');

-- cross wedding: wedding 2 never reaches wedding 1's invitee
:su
select tests.login(:'w2_founder'::uuid);
select is(public.authorize_account_op('set_temp_code', 'B') ->> 'error', 'no_account', 'wedding 2 without pending invitee: no account');
select public.upsert_partner_b('a2.b@example.test') \gset
select public.create_invitation('a2.b@example.test', 'code')::text as inv2 \gset
select is((public.authorize_account_op('set_temp_code', 'B') ->> 'target_user_id')::uuid, :'b2'::uuid, 'wedding 2 targets its own invitee');
select isnt((public.authorize_account_op('set_temp_code', 'B') ->> 'target_user_id')::uuid, :'b1'::uuid, 'never the invitee of wedding 1');
select throws_ok(format($$select public.revoke_invitation(%L)$$, (:'inv1'::jsonb ->> 'id')::uuid), '42501', 'forbidden', 'cross-wedding revoke refused');

-- ---- events cannot be forged ------------------------------------------------------------------
select throws_ok($$select public.record_account_event('temp_code_set', null)$$, '42883', null, 'record_account_event is not callable');
select throws_ok(format($$insert into public.account_events (wedding_id, kind, actor_id) values (%L, 'temp_code_set', %L)$$,
  :'w1_wedding'::uuid, :'w1_founder'::uuid), '42501', null, 'no direct INSERT into account_events');
select is((select count(*)::int from public.account_events where actor_id <> :'w2_founder'::uuid), 0, 'wedding 2 sees no event of wedding 1');
select is((select count(*)::int from public.account_events where kind = 'temp_code_set' and actor_id = :'w2_founder'::uuid), 2,
  'every event of wedding 2 has the caller as actor');

-- ---- update_partner_email: step 1 --------------------------------------------------------------
:su
select tests.login(:'w1_founder'::uuid);
select throws_ok($$select public.update_partner_email('A', 'a1.x@example.test')$$, 'P0001', 'invalid_slot', 'only slot B');
select throws_ok($$select public.update_partner_email('B', 'a1.a@example.test')$$, 'P0001', 'same_email', 'not equal to A');
select throws_ok($$select public.update_partner_email('B', 'a.stranger@example.test')$$, 'P0001', 'email_in_use', 'new address owned by another account');
select public.update_partner_email('B', 'a1.b2@example.test')::text as upd \gset
select is((:'upd'::jsonb ->> 'target_user_id')::uuid, :'b1'::uuid, 'returns the bound reusable account');
select is(:'upd'::jsonb ->> 'old_email', 'a1.b@example.test', 'returns the previous email (compensation)');
select is((select email::text from public.invitations where accepted_at is null and revoked_at is null), 'a1.b2@example.test', 'pending invitation follows');
select is((select count(*)::int from public.account_events where kind = 'email_changed' and target_user_id = :'b1'::uuid), 1, 'email_changed event for B');
-- the Auth account still has the old address (the admin call failed): compensation is allowed
select lives_ok($$select public.update_partner_email('B', 'a1.b@example.test')$$, 'compensation back to the old email');

-- ---- reusability predicate --------------------------------------------------------------------
-- never signed in? no: B signs in once, then A cannot touch the account any more
:su
update auth.users set last_sign_in_at = now() where id = :'b1'::uuid;
select tests.login(:'w1_founder'::uuid);
select throws_ok($$select public.update_partner_email('B', 'a1.b3@example.test')$$, 'P0001', 'partner_already_joined', 'signed-in account: email not editable');
select is(public.authorize_account_op('set_temp_code', 'B') ->> 'error', 'no_account', 'signed-in pending account: no temp code through the pending path');
select throws_ok($$select public.create_invitation('a1.b@example.test', 'code')$$, 'P0001', 'email_in_use', 'signed-in account cannot be re-delivered to');
select is(public.revoke_invitation((:'inv1'::jsonb ->> 'id')::uuid) ->> 'delete_user_id', null, 'revoke returns no account to delete once it has signed in');
select is((select count(*)::int from public.account_events where kind = 'invite_revoked' and actor_id = :'w1_founder'::uuid), 1, 'invite_revoked event');
select is(public.revoke_invitation((:'inv1'::jsonb ->> 'id')::uuid) ->> 'delete_user_id', null, 'revoke is idempotent');
select is((select count(*)::int from public.account_events where kind = 'invite_revoked'), 1, 'idempotent revoke writes the event once');

-- other disqualifiers (direct create_invitation call, e.g. with a chosen token hash)
:su
select tests.make_user('a1.fnd@example.test', true) as fnd \gset
select tests.make_user('a1.mem@example.test') as mem \gset
insert into public.memberships (wedding_id, user_id, role) values (:'w2_wedding'::uuid, :'mem'::uuid, 'family');
-- wedding 4 has no partner B row yet, so the reusability checks are what refuse
select tests.login(:'w4_founder'::uuid);
select throws_ok($$select public.create_invitation('a1.fnd@example.test', 'email', null, decode(repeat('aa', 32), 'hex'))$$,
  'P0001', 'email_in_use', 'a founder account is never reusable');
select throws_ok($$select public.create_invitation('a1.mem@example.test', 'email', null, decode(repeat('aa', 32), 'hex'))$$,
  'P0001', 'email_in_use', 'a member of another wedding is never reusable');
select throws_ok($$select public.create_invitation('a2.b@example.test', 'code')$$, 'P0001', 'email_in_use',
  'an account with a pending invitation of another wedding is not reusable');
select throws_ok($$select public.create_invitation('a1.mem@example.test', 'code', null)$$, 'P0001', 'email_in_use', 'same for the code method');

-- a brand-new account bound after creation: no new delivery, no new event
select public.create_invitation('a1.new@example.test', 'code')::text as inv3 \gset
select is((:'inv3'::jsonb ->> 'invitee_user_id'), null, 'no account yet: invitee_user_id is null');
:su
select tests.make_user('a1.new@example.test') as newb \gset
select tests.login(:'w4_founder'::uuid);
select is((select count(*)::int from public.account_events where kind = 'partner_account_created'), 1, 'one event for the new invitation');
select throws_ok(format($$select public.create_invitation('a1.new@example.test', 'code', %L)$$, :'stranger'::uuid), 'P0001', 'invitee_mismatch',
  'bound id must own the email');
select is((public.create_invitation('a1.new@example.test', 'code', :'newb'::uuid) ->> 'invitee_user_id')::uuid, :'newb'::uuid, 'bind the account just created');
select is((select count(*)::int from public.account_events where kind = 'partner_account_created'), 1, 'binding writes no new event');
select is((select send_count from public.invitations where id = (:'inv3'::jsonb ->> 'id')::uuid), 1, 'binding is not a new delivery');
select is(public.revoke_invitation((:'inv3'::jsonb ->> 'id')::uuid) ->> 'delete_user_id', :'newb'::text, 'revoke returns the account bound to the invitation');

-- ---- accept after revoke, accepted cannot be revoked, full ----------------------------------------
:su
select tests.login(:'newb'::uuid);
select is(public.accept_pending_invitation(), 'revoked', 'a revoked invitation cannot be accepted');
:su
select tests.login(:'w2_founder'::uuid);
-- B (b2) enters wedding 2, then the invitation cannot be revoked nor edited
:su
select tests.login(:'b2'::uuid);
select is(public.accept_pending_invitation(), 'ok', 'b2 accepts');
:su
select tests.login(:'w2_founder'::uuid);
select throws_ok(format($$select public.revoke_invitation(%L)$$, (:'inv2'::jsonb ->> 'id')::uuid), 'P0001', 'already_accepted', 'accepted invitation cannot be revoked');
select throws_ok(format($$select public.rotate_invitation(%L, decode(repeat('ee', 32), 'hex'))$$, (:'inv2'::jsonb ->> 'id')::uuid), 'P0001', 'wrong_method', 'rotate on a code invitation refused');
select is((public.authorize_account_op('set_temp_code', 'B') ->> 'target_user_id')::uuid, :'b2'::uuid, 'after joining, the member is the temp-code target');

-- full: slot B taken, a stray pending invitation exists (inserted as owner) for a third account
:su
select tests.make_user('a2.c@example.test') as c2 \gset
insert into public.invitations (wedding_id, email, method) values (:'w2_wedding'::uuid, 'a2.c@example.test', 'code');
select tests.login(:'c2'::uuid);
select is(public.accept_pending_invitation(), 'full', 'max two partners: third account gets full');
select is((select count(*)::int from public.memberships where user_id = :'c2'::uuid), 0, 'and no membership');

-- ---- sync_my_email follows the Auth account ------------------------------------------------------
:su
update auth.users set email = 'a2.b.new@example.test' where id = :'b2'::uuid;
select tests.login(:'b2'::uuid);
select is(public.sync_my_email(), 'a2.b.new@example.test', 'sync_my_email returns the new email');
select is((select email::text from public.wedding_partners where user_id = :'b2'::uuid), 'a2.b.new@example.test', 'own partner row aligned');

-- ---- invitation_by_token (secret key only) ---------------------------------------------------------
:su
select * from tests.make_wedding('a3') \gset w3_
select tests.make_user('a3.b@example.test') as b3 \gset
select tests.login(:'w3_founder'::uuid);
select public.upsert_partner_b('a3.b@example.test') \gset
select public.create_invitation('a3.b@example.test', 'email', null, decode(repeat('3a', 32), 'hex')) \gset
select throws_ok($$select public.invitation_by_token(decode(repeat('3a', 32), 'hex'))$$, '42501', null, 'authenticated cannot call invitation_by_token');
:su
select tests.login_service();
select is((public.invitation_by_token(decode(repeat('3a', 32), 'hex')) ->> 'user_id')::uuid, :'b3'::uuid, 'valid token returns the bound reusable account');
select is((public.invitation_by_token(decode(repeat('3b', 32), 'hex')) ->> 'ok')::boolean, false, 'unknown token: neutral answer');
:su
update public.invitations set expires_at = now() - interval '1 minute' where email = 'a3.b@example.test';
select tests.login_service();
select is((public.invitation_by_token(decode(repeat('3a', 32), 'hex')) ->> 'ok')::boolean, false, 'expired token: neutral answer');
:su
update public.invitations set expires_at = now() + interval '1 day' where email = 'a3.b@example.test';
update auth.users set last_sign_in_at = now() where id = :'b3'::uuid;
select tests.login_service();
select is((public.invitation_by_token(decode(repeat('3a', 32), 'hex')) ->> 'ok')::boolean, false, 'account no longer reusable: neutral answer');
:su
update auth.users set last_sign_in_at = null where id = :'b3'::uuid;
update public.invitations set revoked_at = now() where email = 'a3.b@example.test';
select tests.login_service();
select is((public.invitation_by_token(decode(repeat('3a', 32), 'hex')) ->> 'ok')::boolean, false, 'revoked token: neutral answer');

select * from finish();
rollback;
