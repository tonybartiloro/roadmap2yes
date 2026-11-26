-- FEAT-2026-004 / T1: RSVP data model - checks, unique active link, cascades (BR5, P6), answers stamp,
-- audit WITHOUT answers/preferences/token_hash (AC14, ADR-0002), column allowlists, rsvp_mode,
-- couple RPCs (create/rotate/revoke/mark shared/undo) and undo_guest_import narrow rule (PO-2, AC7, AC9).
-- All names, notes and emails are FAKE.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(133);

-- rows touched by a statement (a data-modifying CTE cannot sit inside a function argument)
create function pg_temp.rm_rows(p_sql text) returns int language plpgsql as
  $$ declare n int; begin execute p_sql; get diagnostics n = row_count; return n; end $$;

select * from tests.make_wedding('rm1') \gset w1_
select * from tests.make_wedding('rm2') \gset w2_

-- Fixtures as the owner. G1 together, G2 separate; hashes are sha256 of fake labels.
insert into public.guest_groups (id, wedding_id, name, rsvp_mode) values
  ('a4000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'G1', 'together'),
  ('a4000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'G2', 'separate'),
  ('a4000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'GW2', 'together');
insert into public.guests (id, wedding_id, first_name, category, group_id) values
  ('c4000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'P1', 'adult', 'a4000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'P2', 'infant', 'a4000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, 'P3', 'adult', null),
  ('c4000000-0000-4000-8000-000000000004', :'w1_wedding'::uuid, 'P4', 'child', 'a4000000-0000-4000-8000-000000000002'),
  ('c4000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'PW2', 'adult', 'a4000000-0000-4000-8000-000000000009');

-- ===== rsvp_links: shape, hash, one active link per target (AC7) ====================================
select lives_ok(format($$insert into public.rsvp_links (id, wedding_id, group_id, token_hash) values
  ('d4000000-0000-4000-8000-000000000001', %L, 'a4000000-0000-4000-8000-000000000001', extensions.digest('rm-g1', 'sha256'))$$, :'w1_wedding'::uuid), 'a group link');
select lives_ok(format($$insert into public.rsvp_links (id, wedding_id, guest_id, token_hash) values
  ('d4000000-0000-4000-8000-000000000003', %L, 'c4000000-0000-4000-8000-000000000003', extensions.digest('rm-p3', 'sha256'))$$, :'w1_wedding'::uuid), 'a personal link');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, group_id, guest_id, token_hash) values
  (gen_random_uuid(), %L, 'a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', extensions.digest('rm-x1', 'sha256'))$$, :'w1_wedding'::uuid),
  '23514', null, 'a link with both a group and a person is refused');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, token_hash) values (gen_random_uuid(), %L, extensions.digest('rm-x2', 'sha256'))$$, :'w1_wedding'::uuid),
  '23514', null, 'a link with neither a group nor a person is refused');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, guest_id, token_hash) values (gen_random_uuid(), %L, 'c4000000-0000-4000-8000-000000000001', '\x0011')$$, :'w1_wedding'::uuid),
  '23514', null, 'a token hash that is not 32 bytes is refused');
select throws_ok(format($$insert into public.rsvp_links (wedding_id, guest_id, token_hash) values (%L, 'c4000000-0000-4000-8000-000000000001', extensions.digest('rm-x3', 'sha256'))$$, :'w1_wedding'::uuid),
  '23502', null, 'the id comes from the server: no default');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, guest_id, token_hash) values (gen_random_uuid(), %L, 'c4000000-0000-4000-8000-000000000001', extensions.digest('rm-p3', 'sha256'))$$, :'w1_wedding'::uuid),
  '23505', null, 'the token hash is unique');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, group_id, token_hash) values (gen_random_uuid(), %L, 'a4000000-0000-4000-8000-000000000001', extensions.digest('rm-x4', 'sha256'))$$, :'w1_wedding'::uuid),
  '23505', null, 'a second non-revoked link on the same group is refused');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, guest_id, token_hash) values (gen_random_uuid(), %L, 'c4000000-0000-4000-8000-000000000003', extensions.digest('rm-x5', 'sha256'))$$, :'w1_wedding'::uuid),
  '23505', null, 'a second non-revoked link on the same person is refused');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, group_id, token_hash) values (gen_random_uuid(), %L, 'a4000000-0000-4000-8000-000000000009', extensions.digest('rm-x6', 'sha256'))$$, :'w1_wedding'::uuid),
  '23503', null, 'FK: a W1 link cannot point to a W2 group');
select throws_ok(format($$insert into public.rsvp_links (id, wedding_id, guest_id, token_hash) values (gen_random_uuid(), %L, 'c4000000-0000-4000-8000-000000000009', extensions.digest('rm-x7', 'sha256'))$$, :'w1_wedding'::uuid),
  '23503', null, 'FK: a W1 link cannot point to a W2 person');
select throws_ok($$update public.rsvp_links set token_hash = extensions.digest('rm-other', 'sha256') where id = 'd4000000-0000-4000-8000-000000000001'$$,
  '23000', 'immutable_column', 'the token hash is immutable');
select throws_ok($$update public.rsvp_links set group_id = 'a4000000-0000-4000-8000-000000000002' where id = 'd4000000-0000-4000-8000-000000000001'$$,
  '23000', 'immutable_column', 'the target of a link is immutable');
select lives_ok($$update public.rsvp_links set revoked_at = now() where id = 'd4000000-0000-4000-8000-000000000001'$$, 'revoke a link');
select is((select version from public.rsvp_links where id = 'd4000000-0000-4000-8000-000000000001'), 2, 'the revoke bumps the version');
select lives_ok(format($$insert into public.rsvp_links (id, wedding_id, group_id, token_hash) values
  ('d4000000-0000-4000-8000-000000000011', %L, 'a4000000-0000-4000-8000-000000000001', extensions.digest('rm-g1b', 'sha256'))$$, :'w1_wedding'::uuid),
  'after the revoke a new link on the same group is accepted');
select lives_ok(format($$insert into public.rsvp_links (id, wedding_id, group_id, revoked_at, token_hash) values
  (gen_random_uuid(), %L, 'a4000000-0000-4000-8000-000000000001', now(), extensions.digest('rm-g1c', 'sha256'))$$, :'w1_wedding'::uuid),
  'revoked links of the same target can accumulate');

-- ===== rsvp_responses: checks (BR11), one per person ==================================================
select lives_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet, diet_note) values
  ('c4000000-0000-4000-8000-000000000001', %L, 'yes', '{vegan,gluten_free}', 'Allergia fittizia alle noci')$$, :'w1_wedding'::uuid), 'yes with preferences');
select is((select source from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000001'), 'guest', 'no session (public RPC, secret key): source = guest');
select is((select version from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000001'), 1, 'version starts at 1');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status) values ('c4000000-0000-4000-8000-000000000001', %L, 'no')$$, :'w1_wedding'::uuid),
  '23505', null, 'one row per person');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status) values ('c4000000-0000-4000-8000-000000000002', %L, 'maybe')$$, :'w1_wedding'::uuid),
  '23514', null, 'status outside yes/no is refused');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status) values ('c4000000-0000-4000-8000-000000000002', %L, null)$$, :'w1_wedding'::uuid),
  '23502', null, 'status is required (no row = "In attesa")');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet) values ('c4000000-0000-4000-8000-000000000002', %L, 'yes', '{kosher}')$$, :'w1_wedding'::uuid),
  '23514', null, 'a diet value outside the four is refused');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet) values ('c4000000-0000-4000-8000-000000000002', %L, 'yes', '{vegan,vegan}')$$, :'w1_wedding'::uuid),
  '23514', null, 'duplicate diet values are refused');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet) values ('c4000000-0000-4000-8000-000000000002', %L, 'yes', '{vegan,NULL}')$$, :'w1_wedding'::uuid),
  '23514', null, 'a null diet element is refused');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet_note) values ('c4000000-0000-4000-8000-000000000002', %L, 'yes', %L)$$, :'w1_wedding'::uuid, repeat('n', 201)),
  '23514', null, 'a note of 201 characters is refused');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet_note) values ('c4000000-0000-4000-8000-000000000002', %L, 'yes', '   ')$$, :'w1_wedding'::uuid),
  '23514', null, 'a blank note is refused (the app stores null)');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet_note) values ('c4000000-0000-4000-8000-000000000002', %L, 'yes', '')$$, :'w1_wedding'::uuid),
  '23514', null, 'an empty note is refused');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet) values ('c4000000-0000-4000-8000-000000000002', %L, 'no', '{vegan}')$$, :'w1_wedding'::uuid),
  '23514', null, 'BR11: "no" with preferences is refused');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet_note) values ('c4000000-0000-4000-8000-000000000002', %L, 'no', 'x')$$, :'w1_wedding'::uuid),
  '23514', null, 'BR11: "no" with a note is refused');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status) values (gen_random_uuid(), %L, 'yes')$$, :'w1_wedding'::uuid),
  '23503', null, 'FK: an answer needs an existing person');
select throws_ok(format($$insert into public.rsvp_responses (id, wedding_id, status) values ('c4000000-0000-4000-8000-000000000002', %L, 'yes')$$, :'w2_wedding'::uuid),
  '23503', null, 'FK: a W1 person cannot answer inside W2');
select lives_ok(format($$insert into public.rsvp_responses (id, wedding_id, status, diet_note) values ('c4000000-0000-4000-8000-000000000002', %L, 'yes', %L)$$, :'w1_wedding'::uuid, repeat('n', 200)),
  'a note of exactly 200 characters is accepted');
select lives_ok(format($$insert into public.rsvp_responses (id, wedding_id, status) values ('c4000000-0000-4000-8000-000000000004', %L, 'no')$$, :'w1_wedding'::uuid), '"no" without preferences');
select is((select diet from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000004'), '{}'::text[], 'diet defaults to the empty list');
select throws_ok($$update public.rsvp_responses set diet = '{vegan}' where id = 'c4000000-0000-4000-8000-000000000004'$$, '23514', null, 'BR11: cannot add preferences to a "no"');

-- Stamp trigger: an identical rewrite writes nothing; a real change stamps version, answered_at and source.
update public.rsvp_responses set answered_at = answered_at - interval '1 day' where id = 'c4000000-0000-4000-8000-000000000001';
select answered_at as ans0, version as ver0 from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000001' \gset
select count(*) as aud0 from public.audit_log where table_name = 'rsvp_responses' and row_id = 'c4000000-0000-4000-8000-000000000001' \gset
select is(pg_temp.rm_rows($$update public.rsvp_responses set status = 'yes', diet = '{vegan,gluten_free}', diet_note = 'Allergia fittizia alle noci' where id = 'c4000000-0000-4000-8000-000000000001'$$), 0,
  'an identical rewrite affects 0 rows (nothing is written)');
select is((select answered_at::text || ':' || version from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000001'), :'ans0' || ':' || :'ver0', 'answered_at and version are unchanged by an identical rewrite');
select is((select count(*) from public.audit_log where table_name = 'rsvp_responses' and row_id = 'c4000000-0000-4000-8000-000000000001'), :'aud0'::bigint, 'and no audit row is added');
select tests.login(:'w1_founder'::uuid);
reset role;
update public.rsvp_responses set diet = '{vegetarian}' where id = 'c4000000-0000-4000-8000-000000000001';
select is((select version from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000001'), :'ver0'::int + 1, 'a real change bumps the version');
select cmp_ok((select answered_at from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000001'), '>', :'ans0'::timestamptz, 'and moves answered_at to now');
select is((select source from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000001'), 'couple', 'a write with a session (the couple) stamps source = couple');
:su
update public.rsvp_responses set status = 'no', diet = '{}', diet_note = null where id = 'c4000000-0000-4000-8000-000000000001';
select is((select source || ':' || status from public.rsvp_responses where id = 'c4000000-0000-4000-8000-000000000001'), 'guest:no', 'without a session the source goes back to guest');

-- ===== Allowlists: classify every column (fail-closed audit, ADR-0002) ===============================
select is(
  (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
   where a.attrelid = 'public.rsvp_responses'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname::text <> all (array['status', 'diet', 'diet_note'])),
  array['answered_at', 'created_at', 'created_by', 'id', 'source', 'updated_at', 'updated_by', 'version', 'wedding_id']::text[],
  'rsvp_responses: the non-excluded columns are exactly the structural allowlist (a new column fails until classified)');
select is(
  (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
   where a.attrelid = 'public.rsvp_links'::regclass and a.attnum > 0 and not a.attisdropped and a.attname::text <> 'token_hash'),
  array['created_at', 'created_by', 'group_id', 'guest_id', 'id', 'revoked_at', 'revoked_by', 'shared_at', 'shared_by',
        'updated_at', 'updated_by', 'version', 'wedding_id']::text[],
  'rsvp_links: the non-excluded columns are exactly the structural allowlist');
select is(
  (select array_agg(distinct x.arg order by x.arg) from pg_trigger t join pg_class c on c.oid = t.tgrelid
     cross join lateral unnest(string_to_array(encode(t.tgargs, 'escape'), '\000')) x(arg)
   where c.relname = 'rsvp_responses' and t.tgname = 'rsvp_responses_audit' and x.arg <> ''),
  array['diet', 'diet_note', 'status']::text[], 'the rsvp_responses audit trigger excludes exactly status, diet and diet_note');
select is(
  (select array_agg(distinct x.arg order by x.arg) from pg_trigger t join pg_class c on c.oid = t.tgrelid
     cross join lateral unnest(string_to_array(encode(t.tgargs, 'escape'), '\000')) x(arg)
   where c.relname = 'rsvp_links' and t.tgname = 'rsvp_links_audit' and x.arg <> ''),
  array['token_hash']::text[], 'the rsvp_links audit trigger excludes token_hash');
select is(
  (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
   where a.attrelid = 'public.rsvp_link_people'::regclass and a.attnum > 0 and not a.attisdropped),
  array['guest_id', 'link_id', 'wedding_id']::text[], 'rsvp_link_people holds ids only (no personal data, no audit needed)');
select is((select count(*)::int from pg_trigger t where t.tgrelid = 'public.rsvp_link_people'::regclass and not t.tgisinternal), 0, 'rsvp_link_people has no triggers');

-- ===== rsvp_mode on groups (BR1, BR3) =================================================================
select is((select rsvp_mode from public.guest_groups where id = 'a4000000-0000-4000-8000-000000000001'), 'together', 'a group is "together" by default (set explicitly in the fixture)');
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'guest_groups' and column_name = 'rsvp_mode'), '''together''::text', 'the column default is together');
select throws_ok($$update public.guest_groups set rsvp_mode = 'both' where id = 'a4000000-0000-4000-8000-000000000001'$$, '23514', null, 'rsvp_mode outside together/separate is refused');
select tests.login(:'w1_founder'::uuid);
select lives_ok($$update public.guest_groups set rsvp_mode = 'separate' where id = 'a4000000-0000-4000-8000-000000000001'$$, 'the partner changes the mode with the column grant');
select is((select version from public.guest_groups where id = 'a4000000-0000-4000-8000-000000000001'), 2, 'the mode change bumps the version (optimistic concurrency)');
update public.guest_groups set rsvp_mode = 'together' where id = 'a4000000-0000-4000-8000-000000000001';
:su
select is((select a.new_data ->> 'rsvp_mode' from public.audit_log a where a.table_name = 'guest_groups' and a.row_id = 'a4000000-0000-4000-8000-000000000001' and a.op = 'UPDATE' order by a.id limit 1),
  'separate', 'rsvp_mode is structural: it IS in the audit');

-- ===== Cascades: hard delete cleans answers, links and snapshots (BR5, P6, AC14) =====================
insert into public.guest_groups (id, wedding_id, name) values ('a4000000-0000-4000-8000-0000000000a1', :'w1_wedding'::uuid, 'GX');
insert into public.guests (id, wedding_id, first_name, group_id) values
  ('c4000000-0000-4000-8000-0000000000a1', :'w1_wedding'::uuid, 'X1', null),
  ('c4000000-0000-4000-8000-0000000000a2', :'w1_wedding'::uuid, 'X2', 'a4000000-0000-4000-8000-0000000000a1'),
  ('c4000000-0000-4000-8000-0000000000a3', :'w1_wedding'::uuid, 'X3', 'a4000000-0000-4000-8000-0000000000a1');
insert into public.rsvp_links (id, wedding_id, guest_id, shared_at, token_hash) values
  ('d4000000-0000-4000-8000-0000000000a1', :'w1_wedding'::uuid, 'c4000000-0000-4000-8000-0000000000a1', now(), extensions.digest('rm-x1', 'sha256'));
insert into public.rsvp_links (id, wedding_id, group_id, shared_at, token_hash) values
  ('d4000000-0000-4000-8000-0000000000a2', :'w1_wedding'::uuid, 'a4000000-0000-4000-8000-0000000000a1', now(), extensions.digest('rm-gx', 'sha256'));
insert into public.rsvp_link_people (link_id, guest_id, wedding_id) values
  ('d4000000-0000-4000-8000-0000000000a1', 'c4000000-0000-4000-8000-0000000000a1', :'w1_wedding'::uuid),
  ('d4000000-0000-4000-8000-0000000000a2', 'c4000000-0000-4000-8000-0000000000a2', :'w1_wedding'::uuid),
  ('d4000000-0000-4000-8000-0000000000a2', 'c4000000-0000-4000-8000-0000000000a3', :'w1_wedding'::uuid);
insert into public.rsvp_responses (id, wedding_id, status, diet_note) values
  ('c4000000-0000-4000-8000-0000000000a1', :'w1_wedding'::uuid, 'yes', 'Nota cascata fittizia'),
  ('c4000000-0000-4000-8000-0000000000a2', :'w1_wedding'::uuid, 'yes', null);
select tests.login(:'w1_founder'::uuid);
select is((select count(*)::int from public.guests where id = 'c4000000-0000-4000-8000-0000000000a1' and deleted_at is null), 1, 'X1 is live');
update public.guests set deleted_at = now() where id = 'c4000000-0000-4000-8000-0000000000a1';
select is((select count(*)::int from public.rsvp_responses where id = 'c4000000-0000-4000-8000-0000000000a1')
  + (select count(*)::int from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000a1'), 2, 'a SOFT delete keeps the answer and the link (they come back on restore)');
with d as (delete from public.guests where id = 'c4000000-0000-4000-8000-0000000000a1' returning 1) select count(*) as n from d \gset hd_
select is(:hd_n::int, 1, 'the partner hard-deletes the soft-deleted person');
:su
select is((select count(*)::int from public.rsvp_responses where id = 'c4000000-0000-4000-8000-0000000000a1')
  + (select count(*)::int from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000a1')
  + (select count(*)::int from public.rsvp_link_people where guest_id = 'c4000000-0000-4000-8000-0000000000a1'), 0,
  'BR5: answer, personal link and snapshot row are physically gone');
select tests.login(:'w1_founder'::uuid);
update public.guest_groups set deleted_at = now() where id = 'a4000000-0000-4000-8000-0000000000a1';
select is((select count(*)::int from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000a2'), 1, 'soft delete of the group keeps its link (dormant)');
with d as (delete from public.guest_groups where id = 'a4000000-0000-4000-8000-0000000000a1' returning 1) select count(*) as n from d \gset hg_
select is(:hg_n::int, 1, 'the partner hard-deletes the soft-deleted group');
:su
select is((select count(*)::int from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000a2')
  + (select count(*)::int from public.rsvp_link_people where link_id = 'd4000000-0000-4000-8000-0000000000a2'), 0, 'P6: the group link and its snapshot are gone');
select is((select count(*)::int from public.guests where id in ('c4000000-0000-4000-8000-0000000000a2', 'c4000000-0000-4000-8000-0000000000a3')), 2, 'the members stay, without group');
select is((select count(*)::int from public.rsvp_responses where id = 'c4000000-0000-4000-8000-0000000000a2'), 1, 'and the answer of a member stays (it belongs to the person)');
select is((select count(*)::int from public.rsvp_link_people where guest_id = 'c4000000-0000-4000-8000-0000000000a2'), 0, 'while the snapshot that listed them went with the link');

-- ===== Audit: no answers, preferences or token hashes anywhere (AC14) ================================
select cmp_ok((select count(*)::int from public.audit_log where table_name = 'rsvp_responses'), '>=', 5, 'audit is not vacuous for rsvp_responses');
select is((select array_agg(distinct op order by op) from public.audit_log where table_name = 'rsvp_responses'), array['DELETE', 'INSERT', 'UPDATE']::text[], 'rsvp_responses: INSERT, UPDATE and DELETE are audited');
select is((select array_agg(distinct op order by op) from public.audit_log where table_name = 'rsvp_links'), array['DELETE', 'INSERT', 'UPDATE']::text[], 'rsvp_links: INSERT, UPDATE and DELETE are audited');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name in ('rsvp_responses', 'rsvp_links', 'rsvp_link_people')
     and (coalesce(a.old_data, '{}'::jsonb) ?| array['status', 'diet', 'diet_note', 'token_hash']
       or coalesce(a.new_data, '{}'::jsonb) ?| array['status', 'diet', 'diet_note', 'token_hash'])),
  0, 'no audit row of the RSVP tables carries status, diet, diet_note or token_hash');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name in ('rsvp_responses', 'rsvp_links', 'rsvp_link_people')
     and (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '')) ~* 'allergia|noci|cascata|vegan|gluten|vegetarian'),
  0, 'no answer or preference VALUE appears anywhere in the audit');
select is((select a.new_data ->> 'source' || ':' || (a.new_data ->> 'wedding_id') from public.audit_log a
  where a.table_name = 'rsvp_responses' and a.op = 'INSERT' and a.row_id = 'c4000000-0000-4000-8000-000000000001'),
  'guest:' || :'w1_wedding', 'the audit keeps the structural fields (source, wedding) and the row id');
select is(
  (select count(*)::int from public.audit_log a where a.table_name = 'guests'
     and (coalesce(a.old_data, '{}'::jsonb) ?| array['status', 'diet', 'diet_note'])), 0, 'nothing of the answers leaks into the guests audit either');

-- ===== token_hash is not readable by the partner (AC14, ADR-0003) ====================================
select ok(not has_column_privilege('authenticated', 'public.rsvp_links', 'token_hash', 'select'), 'authenticated has no SELECT on token_hash');
select tests.login(:'w1_founder'::uuid);
select throws_ok($$select token_hash from public.rsvp_links$$, '42501', null, 'the partner cannot select token_hash');
select throws_ok($$select * from public.rsvp_links$$, '42501', null, 'nor with select *');
select cmp_ok((select count(*)::int from public.rsvp_links where wedding_id = :'w1_wedding'::uuid), '>', 0, 'but reads the other columns (the fixture is not vacuous)');
:su

-- ===== Couple RPCs: create, rotate, revoke, mark shared and its undo ==================================
insert into public.guests (id, wedding_id, first_name, group_id) values
  ('c4000000-0000-4000-8000-0000000000b1', :'w1_wedding'::uuid, 'R1', null),
  ('c4000000-0000-4000-8000-0000000000b2', :'w1_wedding'::uuid, 'R2', 'a4000000-0000-4000-8000-000000000001');
select tests.login(:'w1_founder'::uuid);
select is(
  public.rsvp_create_links(jsonb_build_array(
    jsonb_build_object('link_id', 'd4000000-0000-4000-8000-0000000000b1', 'token_hash', '\x' || encode(extensions.digest('rm-r1', 'sha256'), 'hex'), 'guest_id', 'c4000000-0000-4000-8000-0000000000b1'),
    jsonb_build_object('link_id', 'd4000000-0000-4000-8000-0000000000b2', 'token_hash', '\x' || encode(extensions.digest('rm-r2', 'sha256'), 'hex'), 'guest_id', 'c4000000-0000-4000-8000-0000000000b2'),
    jsonb_build_object('link_id', 'd4000000-0000-4000-8000-0000000000b3', 'token_hash', '\x' || encode(extensions.digest('rm-r3', 'sha256'), 'hex'), 'guest_id', 'c4000000-0000-4000-8000-000000000004'),
    jsonb_build_object('link_id', 'd4000000-0000-4000-8000-0000000000b4', 'token_hash', '\x' || encode(extensions.digest('rm-r4', 'sha256'), 'hex'), 'guest_id', 'c4000000-0000-4000-8000-000000000003'),
    jsonb_build_object('link_id', 'd4000000-0000-4000-8000-0000000000b5', 'token_hash', '\x' || encode(extensions.digest('rm-r5', 'sha256'), 'hex'), 'group_id', 'a4000000-0000-4000-8000-000000000002'),
    jsonb_build_object('link_id', 'd4000000-0000-4000-8000-0000000000b6', 'token_hash', '\x' || encode(extensions.digest('rm-r6', 'sha256'), 'hex'), 'group_id', 'a4000000-0000-4000-8000-000000000009'),
    jsonb_build_object('link_id', 'd4000000-0000-4000-8000-0000000000b7', 'token_hash', '\x' || encode(extensions.digest('rm-r7', 'sha256'), 'hex'), 'guest_id', 'c4000000-0000-4000-8000-000000000009'))) -> 'created',
  '["d4000000-0000-4000-8000-0000000000b1", "d4000000-0000-4000-8000-0000000000b3"]'::jsonb,
  'create_links: only current recipients without an active link (R1 loose, P4 in a "separate" group); a person of a "together" group, one already linked, a "separate" group target and other-wedding targets are skipped');
select is((select count(*)::int from public.rsvp_links where id::text like 'd4000000-0000-4000-8000-0000000000b%'), 2, 'and nothing else was written');
select is((select created_by from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000b1'), :'w1_founder'::uuid, 'created_by is the partner');
select throws_ok($$select public.rsvp_create_links('{}')$$, 'P0001', 'invalid_items', 'create_links: not an array');
select throws_ok($$select public.rsvp_create_links(null)$$, 'P0001', 'invalid_items', 'create_links: null');
select throws_ok($$select public.rsvp_create_links('["x"]')$$, 'P0001', 'invalid_items', 'create_links: an item that is not an object');
select throws_ok($$select public.rsvp_create_links('[{"link_id":"d4000000-0000-4000-8000-0000000000c1","token_hash":"\\x0011","guest_id":"c4000000-0000-4000-8000-0000000000b1"}]')$$, 'P0001', 'invalid_items', 'create_links: a hash that is not 32 bytes');
select throws_ok(format($$select public.rsvp_create_links(%L::jsonb)$$, jsonb_build_array(jsonb_build_object('link_id', gen_random_uuid(), 'token_hash', '\x' || encode(extensions.digest('rm-c2', 'sha256'), 'hex'),
  'guest_id', 'c4000000-0000-4000-8000-0000000000b1', 'group_id', 'a4000000-0000-4000-8000-000000000001'))), 'P0001', 'invalid_items', 'create_links: group and person together');
select throws_ok($$select public.rsvp_create_links('[{"link_id":"not-a-uuid","token_hash":"\\x00","guest_id":"c4000000-0000-4000-8000-0000000000b1"}]')$$, 'P0001', 'invalid_items', 'create_links: a bad uuid');
select throws_ok(format($$select public.rsvp_create_links(%L::jsonb)$$, (select jsonb_agg(jsonb_build_object('link_id', gen_random_uuid(), 'token_hash', '\x' || encode(extensions.digest('rm-n' || n, 'sha256'), 'hex'),
  'guest_id', gen_random_uuid())) from generate_series(1, 1001) n)), 'P0001', 'too_many_items', 'create_links: 1001 items are refused');
select is(jsonb_array_length(public.rsvp_create_links('[]') -> 'created'), 0, 'create_links: an empty list creates nothing');

-- rotate: old revoked, new on the same target, answers kept, snapshot stays with the old link
select lives_ok($$select public.rsvp_mark_shared('d4000000-0000-4000-8000-0000000000b1')$$, 'mark R1 link as shared');
select is((select shared_at is not null from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000b1'), true, 'shared_at is stamped');
select is((select count(*)::int from public.rsvp_link_people where link_id = 'd4000000-0000-4000-8000-0000000000b1'), 1, 'and the snapshot holds the person');
:su
insert into public.rsvp_responses (id, wedding_id, status) values ('c4000000-0000-4000-8000-0000000000b1', :'w1_wedding'::uuid, 'yes');
select tests.login(:'w1_founder'::uuid);
select throws_ok($$select public.rsvp_rotate_link('d4000000-0000-4000-8000-0000000000b1', 'd4000000-0000-4000-8000-0000000000d1', '\x0011')$$, 'P0001', 'invalid_link', 'rotate: a bad hash is refused');
select is((select revoked_at is null from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000b1'), true, 'and the failed rotate changed nothing (atomic)');
select is(public.rsvp_rotate_link('d4000000-0000-4000-8000-0000000000b1', 'd4000000-0000-4000-8000-0000000000d1', extensions.digest('rm-r1n', 'sha256')) ->> 'link_id',
  'd4000000-0000-4000-8000-0000000000d1', 'rotate returns the new id');
select is((select revoked_at is not null and revoked_by = auth.uid() from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000b1'), true, 'the old link is revoked by the partner');
select is((select guest_id::text || ':' || (shared_at is null)::text || ':' || (revoked_at is null)::text from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000d1'),
  'c4000000-0000-4000-8000-0000000000b1:true:true', 'the new link is on the same person, active and not shared yet ("Da condividere")');
select is((select count(*)::int from public.rsvp_responses where id = 'c4000000-0000-4000-8000-0000000000b1'), 1, 'the answers stay');
select throws_ok($$select public.rsvp_rotate_link('d4000000-0000-4000-8000-0000000000b1', gen_random_uuid(), extensions.digest('rm-q', 'sha256'))$$, 'P0001', 'link_not_found', 'rotate: an already revoked link');
select throws_ok($$select public.rsvp_rotate_link(gen_random_uuid(), gen_random_uuid(), extensions.digest('rm-q2', 'sha256'))$$, 'P0001', 'link_not_found', 'rotate: an unknown link');
select throws_ok($$select public.rsvp_rotate_link('d4000000-0000-4000-8000-0000000000d1', 'd4000000-0000-4000-8000-0000000000d1', extensions.digest('rm-q3', 'sha256'))$$, 'P0001', 'invalid_link', 'rotate: a duplicated id');
select is((select revoked_at is null from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000d1'), true, 'and the failed rotate did not revoke the link');

-- revoke
select is(public.rsvp_revoke_link('d4000000-0000-4000-8000-0000000000d1') ->> 'link_id', 'd4000000-0000-4000-8000-0000000000d1', 'revoke');
select throws_ok($$select public.rsvp_revoke_link('d4000000-0000-4000-8000-0000000000d1')$$, 'P0001', 'link_not_found', 'revoke twice: link_not_found');
select throws_ok($$select public.rsvp_revoke_link(null)$$, 'P0001', 'link_not_found', 'revoke null');
select is((select count(*)::int from public.rsvp_responses where id = 'c4000000-0000-4000-8000-0000000000b1'), 1, 'the answers stay after the revoke (AC7)');
select throws_ok($$select public.rsvp_mark_shared('d4000000-0000-4000-8000-0000000000d1')$$, 'P0001', 'link_not_found', 'mark_shared: a revoked link');
select throws_ok($$select public.rsvp_mark_shared('d4000000-0000-4000-8000-0000000000b4')$$, 'P0001', 'link_not_found', 'mark_shared: a link that does not exist');

-- mark shared / undo with the exact previous snapshot
select public.rsvp_mark_shared('d4000000-0000-4000-8000-0000000000b3') as r \gset ms1_
select is((:'ms1_r'::jsonb -> 'previous' ->> 'shared_at'), null, 'first mark: previous shared_at is null');
select is(jsonb_array_length(:'ms1_r'::jsonb -> 'previous' -> 'people'), 0, 'and the previous snapshot is empty');
select is((select count(*)::int from public.rsvp_link_people where link_id = 'd4000000-0000-4000-8000-0000000000b3'), 1, 'the person is in the snapshot');
select public.rsvp_mark_shared('d4000000-0000-4000-8000-0000000000b3') as r \gset ms2_
select is((:'ms2_r'::jsonb -> 'previous' ->> 'shared_at') is not null and jsonb_array_length(:'ms2_r'::jsonb -> 'previous' -> 'people') = 1, true, 'a second mark returns the first stamp and snapshot as previous');
select lives_ok(format($$select public.rsvp_unmark_shared('d4000000-0000-4000-8000-0000000000b3', %L::jsonb)$$, :'ms1_r'::jsonb -> 'previous'), 'Annulla with the first previous');
select is((select shared_at is null and shared_by is null from public.rsvp_links where id = 'd4000000-0000-4000-8000-0000000000b3'), true, 'shared_at is back to null');
select is((select count(*)::int from public.rsvp_link_people where link_id = 'd4000000-0000-4000-8000-0000000000b3'), 0, 'and the snapshot is empty again');
select throws_ok($$select public.rsvp_unmark_shared('d4000000-0000-4000-8000-0000000000b3', '[]')$$, 'P0001', 'invalid_previous', 'unmark: previous is not an object');
select throws_ok($$select public.rsvp_unmark_shared('d4000000-0000-4000-8000-0000000000b3', '{"people":"x"}')$$, 'P0001', 'invalid_previous', 'unmark: people is not an array');
select throws_ok($$select public.rsvp_unmark_shared('d4000000-0000-4000-8000-0000000000b3', '{"people":["nope"]}')$$, 'P0001', 'invalid_previous', 'unmark: a bad id');
select throws_ok($$select public.rsvp_unmark_shared('d4000000-0000-4000-8000-0000000000b3', '{"shared_at":"never","people":[]}')$$, 'P0001', 'invalid_previous', 'unmark: a bad timestamp');
select throws_ok($$select public.rsvp_unmark_shared(gen_random_uuid(), '{"people":[]}')$$, 'P0001', 'link_not_found', 'unmark: unknown link');
:su

-- ===== undo_guest_import: narrow rule (PO-2) ==========================================================
select tests.login(:'w1_founder'::uuid);
select public.import_guests('[{"first_name":"U1"},{"first_name":"U2"},{"first_name":"U3"},{"first_name":"U4"},
  {"first_name":"U5","group":"UG"},{"first_name":"U6","group":"UG"},{"first_name":"U7"},{"first_name":"U8"}]') as r \gset ui_
:su
select id as u1 from public.guests where first_name = 'U1' and wedding_id = :'w1_wedding'::uuid \gset
select id as u2 from public.guests where first_name = 'U2' and wedding_id = :'w1_wedding'::uuid \gset
select id as u3 from public.guests where first_name = 'U3' and wedding_id = :'w1_wedding'::uuid \gset
select id as u4 from public.guests where first_name = 'U4' and wedding_id = :'w1_wedding'::uuid \gset
select id as u8 from public.guests where first_name = 'U8' and wedding_id = :'w1_wedding'::uuid \gset
select id as ug from public.guest_groups where name = 'UG' and wedding_id = :'w1_wedding'::uuid \gset
insert into public.rsvp_responses (id, wedding_id, status) values (:'u1'::uuid, :'w1_wedding'::uuid, 'yes'), (:'u8'::uuid, :'w1_wedding'::uuid, 'no');
update public.guests set last_name = 'Modificato' where id = :'u8'::uuid;
insert into public.rsvp_links (id, wedding_id, guest_id, token_hash) values (gen_random_uuid(), :'w1_wedding'::uuid, :'u2'::uuid, extensions.digest('rm-u2', 'sha256'));
-- U3 appears only in the snapshot of a shared link of another target
insert into public.rsvp_links (id, wedding_id, group_id, shared_at, token_hash) values
  ('d4000000-0000-4000-8000-0000000000e1', :'w1_wedding'::uuid, 'a4000000-0000-4000-8000-000000000002', now(), extensions.digest('rm-e1', 'sha256'));
insert into public.rsvp_link_people (link_id, guest_id, wedding_id) values ('d4000000-0000-4000-8000-0000000000e1', :'u3'::uuid, :'w1_wedding'::uuid);
-- U4 had a personal link, now revoked; the group UG has an active group link that is not shared
insert into public.rsvp_links (id, wedding_id, guest_id, revoked_at, token_hash) values (gen_random_uuid(), :'w1_wedding'::uuid, :'u4'::uuid, now(), extensions.digest('rm-u4', 'sha256'));
insert into public.rsvp_links (id, wedding_id, group_id, token_hash) values ('d4000000-0000-4000-8000-0000000000e2', :'w1_wedding'::uuid, :'ug'::uuid, extensions.digest('rm-ug', 'sha256'));
select tests.login(:'w2_founder'::uuid);
select is(public.undo_guest_import((:'ui_r'::jsonb ->> 'batch_id')::uuid) ->> 'skipped', '0', 'another wedding: nothing removed, nothing skipped');
:su
select tests.login(:'w1_founder'::uuid);
select public.undo_guest_import((:'ui_r'::jsonb ->> 'batch_id')::uuid) as u \gset uu_
select is((:'uu_u'::jsonb ->> 'guests')::int, 4, 'undo removes U4 (revoked link only), U5, U6 (the group link alone does not protect) and U7');
select is((:'uu_u'::jsonb ->> 'skipped')::int, 3, 'skipped = 3: the answered person, the one with an active personal link and the one in a snapshot');
select is((:'uu_u'::jsonb ->> 'groups')::int, 1, 'the batch group left empty goes (with its link)');
:su
select is((select count(*)::int from public.guests where id in (:'u1'::uuid, :'u2'::uuid, :'u3'::uuid)), 3, 'U1, U2 and U3 are still there');
select is((select count(*)::int from public.guests where id = :'u8'::uuid), 1, 'U8 (answered AND edited since the import) stays by the R-03 rule, not counted as skipped');
select is((select count(*)::int from public.guests where first_name in ('U4', 'U5', 'U6', 'U7') and wedding_id = :'w1_wedding'::uuid), 0, 'the other four are physically gone');
select is((select count(*)::int from public.rsvp_links where group_id = :'ug'::uuid or (guest_id is not null and token_hash = extensions.digest('rm-u4', 'sha256'))), 0, 'their links went with them (cascade)');
select is((select count(*)::int from public.rsvp_responses where id in (:'u1'::uuid, :'u8'::uuid)), 2, 'the answers are kept');
select is((select count(*)::int from public.rsvp_link_people where guest_id = :'u3'::uuid), 1, 'and the snapshot row');
select tests.login(:'w1_founder'::uuid);
select is(public.undo_guest_import((:'ui_r'::jsonb ->> 'batch_id')::uuid) ->> 'guests', '0', 'undoing again removes nothing');
select is(public.undo_guest_import((:'ui_r'::jsonb ->> 'batch_id')::uuid) ->> 'skipped', '3', 'and still reports the 3 that stay');
select is(public.undo_guest_import(null) ->> 'skipped', '0', 'a null batch reports skipped 0');
:su
select is((select count(*)::int from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosrc ~* 'delete\s+from\s+(public\.)?guests?\y' and p.proname <> 'undo_guest_import'), 0, 'undo_guest_import is still the ONLY function that hard-deletes guests');

select * from finish();
rollback;
