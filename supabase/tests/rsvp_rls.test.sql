-- FEAT-2026-004 / T1: RLS, grants and RPC execute for rsvp_links, rsvp_link_people, rsvp_responses and
-- guest_groups.rsvp_mode: anon, other wedding, family/planner and no-membership are denied; the partner
-- only reads; every write goes through the RPCs (AC14, ADR-0002, ADR-0003). All data is FAKE.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(87);

select * from tests.make_wedding('rr1') \gset w1_
select * from tests.make_wedding('rr2') \gset w2_
select tests.make_user('rr.stranger@example.test') as stranger \gset
select tests.make_user('rr.family@example.test') as fam \gset
select tests.make_user('rr.planner@example.test') as plan_user \gset
insert into public.memberships (wedding_id, user_id, role) values
  (:'w1_wedding'::uuid, :'fam'::uuid, 'family'),
  (:'w1_wedding'::uuid, :'plan_user'::uuid, 'planner');

insert into public.guest_groups (id, wedding_id, name) values
  ('a5000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'G1'),
  ('a5000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'GW2');
insert into public.guests (id, wedding_id, first_name, group_id) values
  ('c5000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'P1', 'a5000000-0000-4000-8000-000000000001'),
  ('c5000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'P2', 'a5000000-0000-4000-8000-000000000001'),
  ('c5000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, 'P3', null),
  ('c5000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'PW2', 'a5000000-0000-4000-8000-000000000009');
insert into public.rsvp_links (id, wedding_id, group_id, shared_at, token_hash) values
  ('d5000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'a5000000-0000-4000-8000-000000000001', now(), extensions.digest('rr-g1', 'sha256')),
  ('d5000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'a5000000-0000-4000-8000-000000000009', null, extensions.digest('rr-gw2', 'sha256'));
insert into public.rsvp_link_people (link_id, guest_id, wedding_id) values
  ('d5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid);
insert into public.rsvp_responses (id, wedding_id, status, diet) values
  ('c5000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'yes', '{vegan}'),
  ('c5000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'no', '{}');

-- ===== anon: nothing on the three tables, no RPC =====================================================
select tests.login_anon();
select throws_ok(format($$select * from public.%I$$, t), '42501', null, 'anon: no SELECT on ' || t)
  from unnest(array['rsvp_links', 'rsvp_link_people', 'rsvp_responses']) t;
select throws_ok(format($$insert into public.%I (wedding_id) values (%L)$$, t, :'w1_wedding'::uuid), '42501', null, 'anon: no INSERT on ' || t)
  from unnest(array['rsvp_links', 'rsvp_link_people', 'rsvp_responses']) t;
select throws_ok(format($$update public.%I set wedding_id = wedding_id$$, t), '42501', null, 'anon: no UPDATE on ' || t)
  from unnest(array['rsvp_links', 'rsvp_link_people', 'rsvp_responses']) t;
select throws_ok(format($$delete from public.%I$$, t), '42501', null, 'anon: no DELETE on ' || t)
  from unnest(array['rsvp_links', 'rsvp_link_people', 'rsvp_responses']) t;
select throws_ok(format($$select public.%I(%s)$$, f.n, f.args), '42501', null, 'anon: no EXECUTE on ' || f.n)
  from (values ('rsvp_status', ''), ('rsvp_create_links', '''[]''::jsonb'), ('rsvp_rotate_link', 'gen_random_uuid(), gen_random_uuid(), ''\x00''::bytea'),
    ('rsvp_revoke_link', 'gen_random_uuid()'), ('rsvp_mark_shared', 'gen_random_uuid()'), ('rsvp_unmark_shared', 'gen_random_uuid(), ''{}''::jsonb'),
    ('rsvp_link_matches', 'gen_random_uuid(), ''\x00''::bytea')) f (n, args);
:su

-- ===== stranger, family, planner (no guests rows), other wedding: read nothing =======================
select tests.login(:'stranger'::uuid);
select is((select count(*)::int from public.rsvp_links) + (select count(*)::int from public.rsvp_link_people) + (select count(*)::int from public.rsvp_responses), 0, 'no membership: nothing readable');
:su
select tests.login(:'fam'::uuid);
select is((select count(*)::int from public.rsvp_links) + (select count(*)::int from public.rsvp_link_people) + (select count(*)::int from public.rsvp_responses), 0, 'family: nothing readable');
:su
select tests.login(:'plan_user'::uuid);
select is((select count(*)::int from public.rsvp_links) + (select count(*)::int from public.rsvp_link_people) + (select count(*)::int from public.rsvp_responses), 0, 'planner without guests/read: nothing readable');
:su
select tests.login(:'w2_founder'::uuid);
select is((select count(*)::int from public.rsvp_links where wedding_id = :'w1_wedding'::uuid), 0, 'other wedding: no link of W1');
select is((select count(*)::int from public.rsvp_responses where wedding_id = :'w1_wedding'::uuid), 0, 'other wedding: no answer of W1');
select is((select count(*)::int from public.rsvp_link_people where wedding_id = :'w1_wedding'::uuid), 0, 'other wedding: no snapshot of W1');
select is((select count(*)::int from public.rsvp_links), 1, 'other wedding: sees its own link only');
:su

-- ===== partner: reads (without token_hash) and cannot write anything directly ========================
select tests.login(:'w1_founder'::uuid);
select is((select count(*)::int from public.rsvp_links), 1, 'partner reads the links of W1');
select is((select count(*)::int from public.rsvp_responses), 1, 'partner reads the answers of W1');
select is((select count(*)::int from public.rsvp_link_people), 1, 'partner reads the snapshot of W1');
select is((select diet from public.rsvp_responses where id = 'c5000000-0000-4000-8000-000000000001'), '{vegan}'::text[], 'with the preferences (the couple sees them)');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status) values ('c5000000-0000-4000-8000-000000000002', %L, 'yes')$$, :'w1_wedding'::uuid), '42501', null, 'partner: no direct INSERT of an answer (R-07 will add the RPC)');
select throws_ok($$update public.rsvp_responses set status = 'no' where id = 'c5000000-0000-4000-8000-000000000001'$$, '42501', null, 'partner: no direct UPDATE of an answer');
select throws_ok($$delete from public.rsvp_responses$$, '42501', null, 'partner: no direct DELETE of an answer');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, guest_id, token_hash) values (gen_random_uuid(), %L, 'c5000000-0000-4000-8000-000000000003', '\x%s')$$, :'w1_wedding'::uuid, repeat('ab', 32)), '42501', null, 'partner: no direct INSERT of a link');
select throws_ok($$update public.rsvp_links set revoked_at = now()$$, '42501', null, 'partner: no direct UPDATE of a link');
select throws_ok($$update public.rsvp_links set shared_at = now()$$, '42501', null, 'partner: no direct UPDATE of shared_at');
select throws_ok($$delete from public.rsvp_links$$, '42501', null, 'partner: no direct DELETE of a link');
select throws_ok($$insert into public.rsvp_link_people (link_id, guest_id, wedding_id) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid())$$, '42501', null, 'partner: no direct INSERT in the snapshot');
select throws_ok($$delete from public.rsvp_link_people$$, '42501', null, 'partner: no direct DELETE in the snapshot');
select throws_ok(format($$insert into public.guest_groups (wedding_id, name, rsvp_mode) values (%L, 'X', 'separate')$$, :'w1_wedding'::uuid), '42501', null, 'rsvp_mode is not insertable (always the default; changed later with the version)');
select lives_ok($$update public.guest_groups set rsvp_mode = 'separate' where id = 'a5000000-0000-4000-8000-000000000001'$$, 'partner updates rsvp_mode');
select throws_ok(format($$update public.guest_groups set rsvp_mode = 'together', version = 9 where id = 'a5000000-0000-4000-8000-000000000001'$$), '42501', null, 'version is still not writable');
select lives_ok($$update public.guest_groups set rsvp_mode = 'together' where id = 'a5000000-0000-4000-8000-000000000001'$$, 'and back to together');
:su

-- ===== rsvp_mode: who cannot change it ================================================================
select tests.login(:'w2_founder'::uuid);
with u as (update public.guest_groups set rsvp_mode = 'separate' where id = 'a5000000-0000-4000-8000-000000000001' returning 1) select count(*) as n from u \gset ow_
:su
select is(:ow_n::int, 0, 'other wedding: update of rsvp_mode of a W1 group touches nothing');
select tests.login(:'fam'::uuid);
with u as (update public.guest_groups set rsvp_mode = 'separate' where id = 'a5000000-0000-4000-8000-000000000001' returning 1) select count(*) as n from u \gset fa_
:su
select is(:fa_n::int, 0, 'family: update of rsvp_mode touches nothing');
select tests.login(:'stranger'::uuid);
with u as (update public.guest_groups set rsvp_mode = 'separate' where id = 'a5000000-0000-4000-8000-000000000001' returning 1) select count(*) as n from u \gset st_
:su
select is(:st_n::int, 0, 'no membership: update of rsvp_mode touches nothing');
select is((select rsvp_mode from public.guest_groups where id = 'a5000000-0000-4000-8000-000000000001'), 'together', 'W1 group mode untouched by every attack above');

-- ===== RPC denials ======================================================================================
select tests.login(:'fam'::uuid);
select throws_ok($$select public.rsvp_status()$$, '42501', 'forbidden', 'family: rsvp_status denied');
select throws_ok($$select public.rsvp_create_links('[]')$$, '42501', 'forbidden', 'family: rsvp_create_links denied');
select throws_ok($$select public.rsvp_revoke_link('d5000000-0000-4000-8000-000000000001')$$, '42501', 'forbidden', 'family: rsvp_revoke_link denied');
select throws_ok($$select public.rsvp_mark_shared('d5000000-0000-4000-8000-000000000001')$$, '42501', 'forbidden', 'family: rsvp_mark_shared denied');
select throws_ok($$select public.rsvp_link_matches('d5000000-0000-4000-8000-000000000001', extensions.digest('x', 'sha256'))$$, '42501', 'forbidden', 'family: rsvp_link_matches denied');
:su
select tests.login(:'stranger'::uuid);
select throws_ok($$select public.rsvp_status()$$, '42501', 'forbidden', 'no membership: rsvp_status denied');
select throws_ok($$select public.rsvp_create_links('[]')$$, '42501', 'forbidden', 'no membership: rsvp_create_links denied');
select throws_ok($$select public.rsvp_rotate_link('d5000000-0000-4000-8000-000000000001', gen_random_uuid(), extensions.digest('x', 'sha256'))$$, '42501', 'forbidden', 'no membership: rsvp_rotate_link denied');
select throws_ok($$select public.rsvp_unmark_shared('d5000000-0000-4000-8000-000000000001', '{"people":[]}')$$, '42501', 'forbidden', 'no membership: rsvp_unmark_shared denied');
:su
select tests.login_service();
select throws_ok($$select public.rsvp_status()$$, '42501', 'forbidden', 'secret key (no auth.uid): rsvp_status refused');
select throws_ok($$select public.rsvp_create_links('[]')$$, '42501', 'forbidden', 'secret key: rsvp_create_links refused');
select throws_ok($$select public.rsvp_revoke_link('d5000000-0000-4000-8000-000000000001')$$, '42501', 'forbidden', 'secret key: rsvp_revoke_link refused');
:su
-- a reader without write: guests/read added to planner for this transaction only (rolled back at the end)
insert into private.role_permissions (role, area, action) values ('planner', 'guests', 'read');
select tests.login(:'plan_user'::uuid);
select is((select count(*)::int from public.rsvp_links), 1, 'a reader sees the links');
select is(jsonb_array_length(public.rsvp_status() -> 'links'), 1, 'a reader can call rsvp_status');
select throws_ok($$select public.rsvp_create_links('[]')$$, '42501', 'forbidden', 'a reader without guests/write cannot create links');
select throws_ok($$select public.rsvp_revoke_link('d5000000-0000-4000-8000-000000000001')$$, '42501', 'forbidden', 'nor revoke');
select throws_ok($$select public.rsvp_rotate_link('d5000000-0000-4000-8000-000000000001', gen_random_uuid(), extensions.digest('x', 'sha256'))$$, '42501', 'forbidden', 'nor rotate');
select throws_ok($$select public.rsvp_mark_shared('d5000000-0000-4000-8000-000000000001')$$, '42501', 'forbidden', 'nor mark as shared');
select throws_ok($$select public.rsvp_unmark_shared('d5000000-0000-4000-8000-000000000001', '{"people":[]}')$$, '42501', 'forbidden', 'nor undo it');
select throws_ok($$select public.rsvp_link_matches('d5000000-0000-4000-8000-000000000001', extensions.digest('x', 'sha256'))$$, '42501', 'forbidden', 'a reader without guests/write cannot compare a hash');
:su

-- Another wedding's partner: ids of W1 are invisible, nothing changes.
select tests.login(:'w2_founder'::uuid);
select throws_ok($$select public.rsvp_revoke_link('d5000000-0000-4000-8000-000000000001')$$, 'P0001', 'link_not_found', 'other wedding: revoke a W1 link');
select throws_ok($$select public.rsvp_rotate_link('d5000000-0000-4000-8000-000000000001', gen_random_uuid(), extensions.digest('x', 'sha256'))$$, 'P0001', 'link_not_found', 'other wedding: rotate a W1 link');
select throws_ok($$select public.rsvp_mark_shared('d5000000-0000-4000-8000-000000000001')$$, 'P0001', 'link_not_found', 'other wedding: mark a W1 link');
select throws_ok($$select public.rsvp_unmark_shared('d5000000-0000-4000-8000-000000000001', '{"people":[]}')$$, 'P0001', 'link_not_found', 'other wedding: undo on a W1 link');
select throws_ok($$select public.rsvp_link_matches('d5000000-0000-4000-8000-000000000001', extensions.digest('x', 'sha256'))$$, 'P0001', 'link_not_found', 'other wedding: a W1 link is not found, true or false is never given');
select is(public.rsvp_create_links(jsonb_build_array(
    jsonb_build_object('link_id', gen_random_uuid(), 'token_hash', '\x' || encode(extensions.digest('rr-intruder', 'sha256'), 'hex'), 'group_id', 'a5000000-0000-4000-8000-000000000001'),
    jsonb_build_object('link_id', gen_random_uuid(), 'token_hash', '\x' || encode(extensions.digest('rr-intruder2', 'sha256'), 'hex'), 'guest_id', 'c5000000-0000-4000-8000-000000000003'))) -> 'created',
  '[]'::jsonb, 'other wedding: create_links on W1 targets creates nothing');
select is(public.rsvp_status() ->> 'resend_guest_ids', '[]', 'other wedding: rsvp_status shows nothing of W1');
select is((select count(*)::int from jsonb_array_elements(public.rsvp_status() -> 'links') l where l ->> 'group_id' = 'a5000000-0000-4000-8000-000000000001'), 0, 'and none of its links');
:su
select is((select revoked_at is null and shared_at is not null from public.rsvp_links where id = 'd5000000-0000-4000-8000-000000000001'), true, 'W1 link untouched by every attack above');
select is((select count(*)::int from public.rsvp_links where wedding_id = :'w1_wedding'::uuid), 1, 'and no intruder link exists');

-- rsvp_status of the partner: contract shape
select tests.login(:'w1_founder'::uuid);
select is((select array_agg(k order by k) from jsonb_object_keys(public.rsvp_status()) k), array['expires_on', 'links', 'resend_guest_ids']::text[], 'rsvp_status: the three keys');
select is((select array_agg(k order by k) from jsonb_object_keys(public.rsvp_status() -> 'links' -> 0) k),
  array['created_at', 'group_id', 'guest_id', 'id', 'revoked_at', 'shared_at', 'working']::text[], 'rsvp_status: the link keys (no token, no hash)');
select is(public.rsvp_status() -> 'links' -> 0 ->> 'working', 'true', 'the group link works (two live members, together, no date)');
select is(public.rsvp_status() ->> 'expires_on', null, 'no date chosen: no expiry');
:su

-- ===== Execute and structure ============================================================================
select is(
  (select array_agg(p.proname::text order by p.proname::text) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'rsvp\_%'
     and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')),
  array['rsvp_create_links', 'rsvp_link_matches', 'rsvp_mark_shared', 'rsvp_revoke_link', 'rsvp_rotate_link', 'rsvp_status', 'rsvp_unmark_shared']::text[],
  'the seven couple RPCs: authenticated yes, anon no (T2 adds the public ones for service_role only)');
select is(
  (select array_agg(p.proname::text order by p.proname::text) from pg_proc p
   where p.pronamespace = 'private'::regnamespace and p.proname like 'rsvp\_%'
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  null, 'private RSVP functions are not executable by API roles');
select is(
  (select array_agg(p.proname::text order by p.proname::text) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'rsvp\_%' and not p.prosecdef), null,
  'every RSVP RPC is SECURITY DEFINER with its own permission check (the private rules are not reachable from INVOKER)');
select is(
  (select array_agg(c.relname::text order by c.relname::text) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname in ('rsvp_links', 'rsvp_link_people', 'rsvp_responses') and c.relrowsecurity),
  array['rsvp_link_people', 'rsvp_links', 'rsvp_responses']::text[], 'RLS enabled on the three tables');
select is(
  (select array_agg(c.relname::text || ':' || p.polcmd::text order by c.relname) from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname in ('rsvp_links', 'rsvp_link_people', 'rsvp_responses')),
  array['rsvp_link_people:r', 'rsvp_links:r', 'rsvp_responses:r']::text[], 'exactly one policy each, SELECT only');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('rsvp_links', 'rsvp_link_people', 'rsvp_responses')
     and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type <> 'SELECT'))),
  0, 'no anon grant, and authenticated only SELECT, on the three tables');

select * from finish();
rollback;
