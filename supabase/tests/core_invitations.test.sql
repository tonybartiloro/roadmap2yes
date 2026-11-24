-- T2: invitations adversarial cases (AC5-AC7, plan test plan "inviti via email avversari").
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(21);

select * from tests.make_wedding('i1') \gset i1_
select * from tests.make_wedding('i2') \gset i2_
select tests.make_user('i.bee@example.test') as bee \gset
select tests.make_user('i.eve@example.test') as eve \gset

-- email method: token hash 32 bytes
select tests.login(:'i1_founder'::uuid);
select lives_ok($$select public.create_invitation('i.bee@example.test', 'email', null, decode(repeat('aa', 32), 'hex'))$$,
  'email invitation created');
select is((select expires_at > now() + interval '6 days' from public.invitations where email = 'i.bee@example.test'),
  true, 'expires in 7 days');
select throws_ok($$select public.create_invitation('i.eve@example.test', 'email', null, decode(repeat('bb', 32), 'hex'))$$,
  'P0001', 'invitation_pending', 'a second pending invitation (other email) is refused');
select throws_ok($$select public.create_invitation('i.bee@example.test', 'email', null, decode('abcd', 'hex'))$$,
  'P0001', 'invalid_token', 'short token hash refused');

-- rotate replaces the hash
select lives_ok($$select public.rotate_invitation((select id from public.invitations where email = 'i.bee@example.test'), decode(repeat('cc', 32), 'hex'))$$,
  'rotate');
:su
select is((select encode(token_hash, 'hex') from public.invitations where email = 'i.bee@example.test'), repeat('cc', 32),
  'old token hash is gone after rotate');

-- other wedding cannot rotate/revoke (indistinguishable from not found)
select tests.login(:'i2_founder'::uuid);
select throws_ok($$select public.revoke_invitation((select id from public.invitations where email = 'i.bee@example.test'))$$,
  '42501', 'forbidden', 'cross-wedding revoke refused');
select throws_ok($$select public.rotate_invitation((select id from public.invitations where email = 'i.bee@example.test'), decode(repeat('dd', 32), 'hex'))$$,
  '42501', 'forbidden', 'cross-wedding rotate refused');
select is((select count(*)::int from public.invitations), 0, 'RLS: other wedding sees no invitation');

-- expired token
:su
update public.invitations set expires_at = now() - interval '1 minute' where email = 'i.bee@example.test';
select tests.login(:'bee'::uuid);
select is(public.accept_pending_invitation(), 'expired', 'expired email invitation');
:su
update public.invitations set expires_at = now() + interval '1 day' where email = 'i.bee@example.test';

-- revoke, then accept -> revoked
select tests.login(:'i1_founder'::uuid);
select lives_ok($$select public.revoke_invitation((select id from public.invitations where email = 'i.bee@example.test'))$$, 'revoke');
select lives_ok($$select public.revoke_invitation((select id from public.invitations where email = 'i.bee@example.test'))$$, 'revoke is idempotent');
select throws_ok($$select public.rotate_invitation((select id from public.invitations where email = 'i.bee@example.test'), decode(repeat('ee', 32), 'hex'))$$,
  'P0001', 'not_pending', 'rotate on revoked refused');
:su
select tests.login(:'bee'::uuid);
select is(public.accept_pending_invitation(), 'revoked', 'revoked invitation cannot be accepted');

-- an expired pending invitation is replaced by a new one
:su
select tests.login(:'i1_founder'::uuid);
select lives_ok($$select public.create_invitation('i.bee@example.test', 'email', null, decode(repeat('11', 32), 'hex'))$$,
  'new invitation after revoke');
:su
update public.invitations set expires_at = now() - interval '1 second' where email = 'i.bee@example.test' and revoked_at is null;
select tests.login(:'i1_founder'::uuid);
select lives_ok($$select public.create_invitation('i.eve@example.test', 'email', null, decode(repeat('22', 32), 'hex'))$$,
  'expired pending invitation is auto-revoked by a new one');
select is((select count(*)::int from public.invitations where accepted_at is null and revoked_at is null), 1, 'still a single pending invitation');

-- member of another wedding cannot be invited
select throws_ok(format($$select public.create_invitation('i2.a@example.test', 'code', %L)$$, :'i2_founder'::uuid),
  'P0001', 'email_in_use', 'account that already belongs to a wedding cannot be invited');

-- token_hash never reaches audit_log
:su
select is((select count(*)::int from public.audit_log where table_name = 'invitations' and (new_data ? 'token_hash' or old_data ? 'token_hash')),
  0, 'audit_log never contains token_hash');

-- eve accepts her own pending invitation; wrong user cannot take bee's
select tests.login(:'eve'::uuid);
select is(public.accept_pending_invitation(), 'ok', 'invitee accepts');
select is((select role from public.memberships where user_id = :'eve'::uuid), 'partner', 'membership role partner');

select * from finish();
rollback;
