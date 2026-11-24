-- T2: create_wedding (AC3, AC4, BR13), partner B, invitations and acceptance (AC5, AC6).
begin;
-- :su = back to the superuser AND no JWT claims (reset role alone keeps auth.uid()).
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(29);

-- ---- create_wedding -------------------------------------------------------------------------
select tests.make_user('w.plain@example.test') as plain \gset
select tests.make_user('w.founder@example.test', true, 'sposa') as founder \gset
select tests.make_user('w.invited@example.test', true) as invited \gset

select tests.login(:'plain'::uuid);
select throws_ok($$select public.create_wedding()$$, '42501', 'not_founder', 'no founder claim: refused');

:su
insert into public.weddings (id) values ('11111111-1111-4111-8111-111111111111');
insert into public.wedding_partners (wedding_id, slot, email)
  values ('11111111-1111-4111-8111-111111111111', 'A', 'w.other@example.test');
insert into public.invitations (wedding_id, email, method) values
  ('11111111-1111-4111-8111-111111111111', 'w.invited@example.test', 'code');
select tests.login(:'invited'::uuid);
select throws_ok($$select public.create_wedding()$$, 'P0001', 'pending_invitation',
  'founder with a pending invitation for his email cannot create a wedding (BR13)');

:su
select tests.login(:'founder'::uuid);
select lives_ok($$select public.create_wedding()$$, 'founder creates the wedding');
select is((select label from public.wedding_partners where user_id = :'founder'::uuid), 'sposa',
  'partner A label comes from r2y_role');
select is((select partner_slot from public.memberships where user_id = :'founder'::uuid), 'A', 'membership A created');
select is((select email::text from public.wedding_partners where user_id = :'founder'::uuid),
  'w.founder@example.test', 'partner A email = account email');
select throws_ok($$select public.create_wedding()$$, 'P0001', 'already_member', 'second call refused');

:su
select tests.make_user('w.noattach@example.test', true) as f2 \gset
insert into public.weddings (created_by) values (:'f2'::uuid);
select tests.login(:'f2'::uuid);
select throws_ok($$select public.create_wedding()$$, 'P0001', 'already_created',
  'founder that already created a wedding (no membership) is refused');
:su
select throws_ok($$insert into public.weddings (created_by) values ((select created_by from public.weddings where created_by = (select id from auth.users where email = 'w.founder@example.test')))$$,
  '23505', null, 'unique index: one wedding per creator');

-- ---- partner B ------------------------------------------------------------------------------
select tests.login(:'founder'::uuid);
select throws_ok($$select public.upsert_partner_b('w.founder@example.test')$$, 'P0001', 'same_email', 'B email != A email');
select lives_ok($$select public.upsert_partner_b('W.Bee@Example.test', 'Bea', 'Prova', 'sposo')$$, 'A creates partner B');
select is((select email::text from public.wedding_partners where slot = 'B'), 'w.bee@example.test', 'B email normalized');
select throws_ok($$select public.upsert_partner_b('w.other-b@example.test')$$, 'P0001', 'email_change_not_allowed',
  'upsert cannot change the email of an existing B');
select lives_ok($$select public.upsert_partner_b('w.bee@example.test', 'Beatrice', null, null)$$, 'upsert edits names');
select throws_ok($$select public.upsert_partner_b('not-an-email')$$, 'P0001', 'invalid_email', 'invalid email refused');

-- ---- invitations (method code) --------------------------------------------------------------
:su
select tests.make_user('w.bee@example.test') as bee \gset
select tests.login(:'founder'::uuid);
select throws_ok($$select public.create_invitation('w.other-b@example.test', 'code')$$, 'P0001', 'partner_email_mismatch',
  'invitation email must match the partner B row');
select throws_ok(format($$select public.create_invitation('w.bee@example.test', 'code', %L)$$, :'plain'::uuid),
  'P0001', 'invitee_mismatch', 'invitee user must own the email');
select throws_ok($$select public.create_invitation('w.bee@example.test', 'email')$$, 'P0001', 'invalid_token',
  'email method needs a token hash');
select lives_ok(format($$select public.create_invitation('w.bee@example.test', 'code', %L)$$, :'bee'::uuid),
  'create code invitation');
select is((select send_count from public.invitations where email = 'w.bee@example.test'), 1, 'send_count 1');
select lives_ok($$select public.create_invitation('w.bee@example.test', 'code')$$, 're-delivery of the same invitation');
select is((select count(*)::int from public.invitations where email = 'w.bee@example.test'), 1, 're-delivery makes no duplicate');
select is((select send_count from public.invitations where email = 'w.bee@example.test'), 2, 'send_count 2');

-- ---- accept ---------------------------------------------------------------------------------
:su
select tests.login(:'bee'::uuid);
select is(public.accept_pending_invitation(), 'ok', 'B accepts at first access');
select is(public.accept_pending_invitation(), 'already_member', 'second accept is a no-op');
select is((select user_id from public.wedding_partners where slot = 'B'), :'bee'::uuid, 'partner B row linked to the user');
select is((select count(*)::int from public.memberships where wedding_id = (select wedding_id from public.memberships where user_id = :'bee'::uuid)),
  2, 'two memberships');

-- a third account cannot take a slot: the slot is taken
:su
select tests.make_user('w.third@example.test') as third \gset
select tests.login(:'third'::uuid);
select is(public.accept_pending_invitation(), 'not_found', 'no invitation for a stranger');
select is((select count(*)::int from public.memberships where user_id = :'third'::uuid), 0, 'stranger has no membership');

select * from finish();
rollback;
