-- FEAT-2026-004 / T2: public RPCs rsvp_gate, rsvp_page, rsvp_submit and the limiter (AC3-AC6, AC10-AC12,
-- AC14; BR1-BR4, BR7-BR9; QA-1, QA-2, QA-8, QA-9 (sequential part), QA-11, PO-1). All data is FAKE.
-- The RPCs are DEFINER and do not depend on the caller, so most calls run as the owner; the grants are
-- tested with the real roles.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(146);

create function pg_temp.h(p text) returns bytea language sql as $$ select extensions.digest('pub-' || p, 'sha256') $$;
create function pg_temp.ik(p text) returns bytea language sql as $$ select extensions.digest('ip-' || p, 'sha256') $$;
-- one submit answer item
create function pg_temp.ans(p_id uuid, p_status text, p_diet text[] default null, p_note text default null, p_seen text default null)
returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'status', p_status, 'diet', to_jsonb(p_diet), 'diet_note', p_note, 'seen_at', p_seen) $$;
create function pg_temp.fnd(p_f uuid, p_sql text) returns void language plpgsql as $$
begin
  perform tests.login(p_f);
  execute p_sql;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;
create function pg_temp.keys(p jsonb) returns text[] language sql as $$ select array_agg(k order by k) from jsonb_object_keys(p) k $$;
create function pg_temp.ids(p jsonb) returns text[] language sql as $$ select array_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(p -> 'people') e $$;

select * from tests.make_wedding('rp1') \gset w1_
select * from tests.make_wedding('rp2') \gset w2_
update public.wedding_partners set first_name = 'Anna' where wedding_id = :'w1_wedding'::uuid and slot = 'A';
insert into public.wedding_partners (wedding_id, slot, first_name, email) values (:'w1_wedding'::uuid, 'B', 'Bruno', 'rp1.b@example.test');
update public.wedding_partners set first_name = 'Zeno' where wedding_id = :'w2_wedding'::uuid and slot = 'A';
update public.weddings set theme_id = 'mare' where id = :'w2_wedding'::uuid;

-- W1: GT together (Mario, Gigi child, Neo infant), GS separate (Sara), GH together (Estraneo), GE together (empty),
-- loose Lia. Personal data everywhere, to prove none of it is returned.
insert into public.guest_tables (id, wedding_id, name) values ('b6000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Tavolo Segretissimo');
insert into public.guest_groups (id, wedding_id, name, rsvp_mode) values
  ('a6000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'GT', 'together'),
  ('a6000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'GS', 'separate'),
  ('a6000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, 'GH', 'together'),
  ('a6000000-0000-4000-8000-000000000004', :'w1_wedding'::uuid, 'GE', 'together'),
  ('a6000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'GT', 'together');
insert into public.guests (id, wedding_id, first_name, last_name, category, side, phone, email, notes, group_id, table_id) values
  ('c6000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'Mario', 'Rossi', 'adult', 'A', '+39 000 000 6001', 'mario.rp@example.test', 'Nota Segretissima', 'a6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001'),
  ('c6000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, 'Gigi', 'Rossi', 'child', 'B', null, null, null, 'a6000000-0000-4000-8000-000000000001', null),
  ('c6000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, 'Neo', null, 'infant', null, null, null, null, 'a6000000-0000-4000-8000-000000000001', null),
  ('c6000000-0000-4000-8000-000000000004', :'w1_wedding'::uuid, 'Sara', 'Bianchi', 'adult', 'both', '+39 000 000 6004', null, null, 'a6000000-0000-4000-8000-000000000002', null),
  ('c6000000-0000-4000-8000-000000000005', :'w1_wedding'::uuid, 'Estraneo', 'Verdi', 'adult', 'A', null, null, null, 'a6000000-0000-4000-8000-000000000003', null),
  ('c6000000-0000-4000-8000-000000000006', :'w1_wedding'::uuid, 'Lia', 'Neri', 'adult', null, null, null, null, null, null),
  ('c6000000-0000-4000-8000-000000000007', :'w1_wedding'::uuid, 'Dormiente', null, 'adult', null, null, null, null, 'a6000000-0000-4000-8000-000000000001', null),
  ('c6000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'Mario', 'Rossi', 'adult', null, null, null, null, 'a6000000-0000-4000-8000-000000000009', null);
update public.guests set deleted_at = now() where id = 'c6000000-0000-4000-8000-000000000007';
insert into public.rsvp_links (id, wedding_id, group_id, guest_id, revoked_at, token_hash) values
  ('d6000000-0000-4000-8000-000000000001', :'w1_wedding'::uuid, 'a6000000-0000-4000-8000-000000000001', null, null, pg_temp.h('gt')),
  ('d6000000-0000-4000-8000-000000000002', :'w1_wedding'::uuid, null, 'c6000000-0000-4000-8000-000000000004', null, pg_temp.h('sara')),
  ('d6000000-0000-4000-8000-000000000003', :'w1_wedding'::uuid, null, 'c6000000-0000-4000-8000-000000000006', null, pg_temp.h('lia')),
  ('d6000000-0000-4000-8000-000000000004', :'w1_wedding'::uuid, 'a6000000-0000-4000-8000-000000000003', null, null, pg_temp.h('gh')),
  ('d6000000-0000-4000-8000-000000000005', :'w1_wedding'::uuid, 'a6000000-0000-4000-8000-000000000004', null, null, pg_temp.h('empty')),
  ('d6000000-0000-4000-8000-000000000006', :'w1_wedding'::uuid, null, 'c6000000-0000-4000-8000-000000000001', null, pg_temp.h('mario-dormant')),
  ('d6000000-0000-4000-8000-000000000007', :'w1_wedding'::uuid, null, 'c6000000-0000-4000-8000-000000000005', now(), pg_temp.h('revoked')),
  ('d6000000-0000-4000-8000-000000000008', :'w1_wedding'::uuid, null, 'c6000000-0000-4000-8000-000000000006', now(), pg_temp.h('lia-old')),
  ('d6000000-0000-4000-8000-000000000009', :'w2_wedding'::uuid, 'a6000000-0000-4000-8000-000000000009', null, null, pg_temp.h('gt2'));
select 'c6000000-0000-4000-8000-000000000001'::uuid as mario, 'c6000000-0000-4000-8000-000000000002'::uuid as gigi,
  'c6000000-0000-4000-8000-000000000003'::uuid as neo, 'c6000000-0000-4000-8000-000000000006'::uuid as lia,
  'c6000000-0000-4000-8000-000000000009'::uuid as mario2 \gset

-- ===== Grants: service_role only =========================================================================
select tests.login_anon();
select throws_ok(format($$select public.%I(%s)$$, f.n, f.a), '42501', null, 'anon: no EXECUTE on ' || f.n)
  from (values ('rsvp_gate', 'null::bytea'), ('rsvp_page', 'null::bytea'), ('rsvp_submit', 'null::bytea, null::bytea, ''[]''::jsonb')) f (n, a);
:su
select tests.login(:'w1_founder'::uuid);
select throws_ok(format($$select public.%I(%s)$$, f.n, f.a), '42501', null, 'a signed-in partner: no EXECUTE on ' || f.n)
  from (values ('rsvp_gate', 'null::bytea'), ('rsvp_page', 'null::bytea'), ('rsvp_submit', 'null::bytea, null::bytea, ''[]''::jsonb')) f (n, a);
:su
select tests.login_service();
select lives_ok($$select public.rsvp_gate(extensions.digest('x', 'sha256'))$$, 'service_role: rsvp_gate');
select lives_ok($$select public.rsvp_page(extensions.digest('x', 'sha256'))$$, 'service_role: rsvp_page');
select lives_ok($$select public.rsvp_submit(extensions.digest('x', 'sha256'), null, '[]')$$, 'service_role: rsvp_submit');
:su
select is((select array_agg(p.proname::text order by p.proname::text) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('rsvp_gate', 'rsvp_page', 'rsvp_submit') and p.prosecdef),
  array['rsvp_gate', 'rsvp_page', 'rsvp_submit']::text[], 'the three public RPCs are SECURITY DEFINER');
select is((select p.provolatile::text from pg_proc p where p.proname = 'rsvp_gate' and p.pronamespace = 'public'::regnamespace), 's', 'rsvp_gate is STABLE (QA-11)');
select is((select count(*)::int from pg_class c where c.relnamespace = 'private'::regnamespace and c.relname = 'rsvp_attempts' and c.relrowsecurity), 1, 'private.rsvp_attempts has RLS');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname in ('rsvp_hit', 'rsvp_hit_ip', 'rsvp_hit_link', 'rsvp_limits', 'rsvp_attempts_gc', 'rsvp_resolve', 'rsvp_people_json', 'rsvp_item_ok')
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 0, 'the private helpers are not executable by API roles');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'private'::regnamespace and p.prosrc ~* 'login_attempts' and p.proname like 'rsvp%'), 0, 'the limiter does not share the login table or its cleanup');

-- ===== rsvp_page: closed key set, no leaks (AC3) =========================================================
select public.rsvp_page(pg_temp.h('gt'), null) as pg \gset a_
select is(pg_temp.keys(:'a_pg'::jsonb), array['couple', 'date', 'location', 'ok', 'people', 'theme_id']::text[], 'rsvp_page: EXACTLY these keys');
select is(pg_temp.keys(:'a_pg'::jsonb -> 'people' -> 0), array['answered_at', 'category', 'diet', 'diet_note', 'first_name', 'id', 'last_name', 'status']::text[], 'each person: EXACTLY these keys (opaque id, names, category, answer)');
select is((:'a_pg'::jsonb ->> 'ok'), 'true', 'a working link');
select is(:'a_pg'::jsonb -> 'couple', '["Anna", "Bruno"]'::jsonb, 'the couple: first names only, in slot order');
select is(:'a_pg'::jsonb ->> 'theme_id', 'giardino', 'the theme of the wedding');
select is((select array_agg(e ->> 'id' order by e ->> 'first_name') from jsonb_array_elements(:'a_pg'::jsonb -> 'people') e),
  array[:'gigi', :'mario', :'neo']::text[], 'AC5: all LIVE members of the "together" group, the infant included; not the deleted one, nor other groups');
select is((select array_agg(e ->> 'category' order by e ->> 'first_name') from jsonb_array_elements(:'a_pg'::jsonb -> 'people') e), array['child', 'adult', 'infant']::text[], 'categories: child, adult, infant');
select is((select count(*)::int from jsonb_array_elements(:'a_pg'::jsonb -> 'people') e where e ->> 'status' is null and e -> 'diet' = '[]'::jsonb and e ->> 'diet_note' is null and e ->> 'answered_at' is null), 3, 'nobody has answered: "In attesa"');
select is(:'a_pg'::text ~* 'segretissim|example\.test|\+39|Estraneo|Sara|Bianchi|Dormiente|Lia|Verdi|"side"|"phone"|"email"|"notes"|table|group', false, 'no contact, note, side, table, group or other guest anywhere in the answer');
select is(pg_temp.keys(public.rsvp_page(pg_temp.h('sara'), null)) , array['couple', 'date', 'location', 'ok', 'people', 'theme_id']::text[], 'the personal link of a person in a "separate" group works with the same keys');
select is(pg_temp.ids(public.rsvp_page(pg_temp.h('sara'), null)), array['c6000000-0000-4000-8000-000000000004']::text[], 'and covers only that person');
select is(pg_temp.ids(public.rsvp_page(pg_temp.h('lia'), null)), array['c6000000-0000-4000-8000-000000000006']::text[], 'a loose person: only themselves');
select is(pg_temp.ids(public.rsvp_page(pg_temp.h('gt2'), null)), array['c6000000-0000-4000-8000-000000000009']::text[], 'other wedding: only its own person (same names, no crossing)');
select is(public.rsvp_page(pg_temp.h('gt2'), null) -> 'couple', '["Zeno", null]'::jsonb, 'other wedding: its own couple (no partner B: null)');
select is(public.rsvp_gate(pg_temp.h('gt2'), null) ->> 'theme_id', 'mare', 'other wedding: its own theme');

-- BR8: date and location only when TAKEN
select is(:'a_pg'::jsonb -> 'date', 'null'::jsonb, 'no date decision: date is null');
select is(:'a_pg'::jsonb -> 'location', 'null'::jsonb, 'no location decision: location is null');
select pg_temp.fnd(:'w1_founder'::uuid, format($q$select public.complete_onboarding(%L::jsonb, %L::jsonb)$q$,
  jsonb_build_array(jsonb_build_object('kind', 'fixed', 'date_from', (private.rome_today() + 200)::text, 'label', 'Settembre')),
  jsonb_build_array(jsonb_build_object('template_key', 'scegli-data-e-location', 'template_version', 1, 'title', 'Scegliere data e location', 'offset', null))));
select d.id as dd from public.decisions d where d.wedding_id = :'w1_wedding'::uuid and d.key = 'date' \gset
select d.id as ld from public.decisions d where d.wedding_id = :'w1_wedding'::uuid and d.key = 'location' \gset
select o.id as od from public.decision_options o where o.decision_id = :'dd'::uuid \gset
insert into public.decision_options (decision_id, wedding_id, title, comune) values (:'ld'::uuid, :'w1_wedding'::uuid, 'Villa Esempio', 'Roma') returning id as lo \gset
select is(public.rsvp_page(pg_temp.h('gt'), null) -> 'date', 'null'::jsonb, 'open decisions: still no date (provisional data is never shown, BR8)');
select is(public.rsvp_page(pg_temp.h('gt'), null) -> 'location', 'null'::jsonb, 'and no location');
select pg_temp.fnd(:'w1_founder'::uuid, format($q$select public.choose_option(%L, %L)$q$, :'ld', :'lo'));
select is(public.rsvp_page(pg_temp.h('gt'), null) -> 'location', '{"name": "Villa Esempio", "comune": "Roma"}'::jsonb, 'location taken: name and comune, nothing else');
select is(public.rsvp_page(pg_temp.h('gt'), null) -> 'date', 'null'::jsonb, 'the date is still not taken');

-- ===== Expiry: date + 30 days, Europe/Rome, p_now from the server (BR7, AC12, QA-1, QA-5) ====================
update public.date_scenarios set date_from = date '2027-03-10' where option_id = :'od'::uuid;
select pg_temp.fnd(:'w1_founder'::uuid, format($q$select public.choose_option(%L, %L)$q$, :'dd', :'od'));
select is(public.rsvp_page(pg_temp.h('gt'), null, '2027-03-01 12:00:00 Europe/Rome') ->> 'date', '2027-03-10', 'date taken: shown');
select is(public.rsvp_page(pg_temp.h('gt'), null, '2027-04-09 23:59:59 Europe/Rome') ->> 'ok', 'true', '2027-03-10 + 30 (DST starts 03-28): 23:59:59 on the last day works');
select is(public.rsvp_page(pg_temp.h('gt'), null, '2027-04-10 00:00:00 Europe/Rome'), '{"ok": false}'::jsonb, 'one second later: the neutral answer');
select is(public.rsvp_gate(pg_temp.h('gt'), null, '2027-04-09 23:59:59 Europe/Rome') ->> 'theme_id', 'giardino', 'gate agrees on the last day');
select is(public.rsvp_gate(pg_temp.h('gt'), null, '2027-04-10 00:00:00 Europe/Rome') ->> 'theme_id', null, 'gate: an expired link has no theme');
select is(public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'yes')), '2027-04-10 00:00:00 Europe/Rome'), '{"ok": false}'::jsonb, 'submit on an expired link: the same neutral content');
select is((select count(*)::int from public.rsvp_responses where wedding_id = :'w1_wedding'::uuid), 0, 'and it wrote nothing');
select pg_temp.fnd(:'w1_founder'::uuid, format($q$select public.reopen_decision(%L, 'cambio')$q$, :'dd'));
update public.date_scenarios set date_from = date '2027-10-05' where option_id = :'od'::uuid;
select pg_temp.fnd(:'w1_founder'::uuid, format($q$select public.choose_option(%L, %L)$q$, :'dd', :'od'));
select is(public.rsvp_page(pg_temp.h('gt'), null, '2027-11-04 23:59:59 Europe/Rome') ->> 'ok', 'true', '2027-10-05 + 30 (DST ends 10-31): last second works');
select is(public.rsvp_page(pg_temp.h('gt'), null, '2027-11-05 00:00:00 Europe/Rome'), '{"ok": false}'::jsonb, 'the next midnight is neutral');
select pg_temp.fnd(:'w1_founder'::uuid, format($q$select public.reopen_decision(%L, 'cambio')$q$, :'dd'));
select is(public.rsvp_page(pg_temp.h('gt'), null, '2040-01-01 12:00:00 Europe/Rome') ->> 'ok', 'true', 'date reopened: no expiry (links created before the date is chosen keep working)');
select is(public.rsvp_page(pg_temp.h('gt'), null, '2040-01-01 12:00:00 Europe/Rome') -> 'date', 'null'::jsonb, 'and the date is "da confermare" again');

-- ===== The neutral answer is identical for every cause (AC6) =============================================
select is(public.rsvp_page(pg_temp.h('does-not-exist'), null), '{"ok": false}'::jsonb, 'unknown token');
select is(public.rsvp_page(pg_temp.h('revoked'), null), '{"ok": false}'::jsonb, 'revoked link');
select is(public.rsvp_page(pg_temp.h('lia-old'), null), '{"ok": false}'::jsonb, 'revoked link (replaced by a newer one)');
select is(public.rsvp_page(pg_temp.h('empty'), null), '{"ok": false}'::jsonb, 'a group without live members');
select is(public.rsvp_page(pg_temp.h('mario-dormant'), null), '{"ok": false}'::jsonb, 'a person who is not a recipient (their group answers together)');
select is(public.rsvp_page(null, null), '{"ok": false}'::jsonb, 'null hash');
select is(public.rsvp_page('\x0011', null), '{"ok": false}'::jsonb, 'a hash of the wrong length');
select is(public.rsvp_gate(pg_temp.h('does-not-exist'), null), '{"blocked": false, "retry_after_seconds": 0, "theme_id": null}'::jsonb, 'gate: unknown token: not blocked, no theme');
select is(public.rsvp_gate(pg_temp.h('revoked'), null) ->> 'theme_id', null, 'gate: a revoked link reveals no theme');
select throws_ok($$select public.rsvp_page(extensions.digest('x', 'sha256'), '\x00'::bytea)$$, 'P0001', 'invalid_key', 'a malformed IP key is a server bug: invalid_key');
select throws_ok($$select public.rsvp_gate(extensions.digest('x', 'sha256'), '\x00'::bytea)$$, 'P0001', 'invalid_key', 'gate: same');
select throws_ok($$select public.rsvp_submit(extensions.digest('x', 'sha256'), '\x00'::bytea, '[]')$$, 'P0001', 'invalid_key', 'submit: same');
select is((select count(*)::int from private.rsvp_attempts), 0, 'no limiter row so far: null IP key means no IP limit, and gate never writes');

-- ===== Limits (BR9, QA-2, QA-11) =========================================================================
select count(*) filter (where r = '{"ok": false}'::jsonb) as neutral from (select public.rsvp_page(pg_temp.h('bad-' || i), pg_temp.ik('k1')) r from generate_series(1, 9) i) x \gset l1_
select is(:l1_neutral::int, 9, 'nine invalid links from one IP: all neutral');
select is(public.rsvp_gate(pg_temp.h('bad-x'), pg_temp.ik('k1')) ->> 'blocked', 'false', 'after 9 the IP is not blocked yet');
select is(public.rsvp_page(pg_temp.h('bad-10'), pg_temp.ik('k1')), '{"ok": false}'::jsonb, 'the 10th invalid link is still a plain neutral answer');
select is(public.rsvp_gate(pg_temp.h('bad-x'), pg_temp.ik('k1')) ->> 'blocked', 'true', 'and from the 11th the gate blocks (429 at the proxy)');
select ok((public.rsvp_gate(pg_temp.h('bad-x'), pg_temp.ik('k1')) ->> 'retry_after_seconds')::int between 1 and 900, 'retry_after_seconds is in (0, 900]');
select is(public.rsvp_gate(pg_temp.h('gt'), pg_temp.ik('k1')) ->> 'blocked', 'false', 'a WORKING token is never blocked by the IP limit');
select is(public.rsvp_gate(pg_temp.h('gt'), pg_temp.ik('k1')) ->> 'theme_id', 'giardino', 'and gets its theme');
select is(public.rsvp_page(pg_temp.h('gt'), pg_temp.ik('k1')) ->> 'ok', 'true', 'the page of a working link opens from a blocked IP');
select is((select failed_count from private.rsvp_attempts where key_hash = pg_temp.ik('k1')), 10, 'a working link does not consume the IP counter');
select is(public.rsvp_page(pg_temp.h('bad-11'), pg_temp.ik('k1')), '{"ok": false}'::jsonb, 'a blocked IP still gets the neutral page answer');
select is((select failed_count from private.rsvp_attempts where key_hash = pg_temp.ik('k1')), 10, 'a locked key is not extended or counted further');
select count(*) as n from private.rsvp_attempts \gset rows0_
select count(*) as n from (select public.rsvp_gate(pg_temp.h('bad-g' || i), pg_temp.ik('k3')) from generate_series(1, 30) i) x \gset gate_
select is((select count(*)::int from private.rsvp_attempts), :rows0_n::int, 'rsvp_gate writes nothing, even for 30 invalid links (QA-11)');
select count(*) as n from (select public.rsvp_page(pg_temp.h('bad-n' || i), null) from generate_series(1, 30) i) x \gset nul_
select is((select count(*)::int from private.rsvp_attempts), :rows0_n::int, 'null IP key: 30 invalid links leave no counter (no IP limit, P5)');
select count(*) as n from (select public.rsvp_page(pg_temp.h('gt'), pg_temp.ik('k2')) from generate_series(1, 30) i) x \gset ok_
select is((select count(*)::int from private.rsvp_attempts where key_hash = pg_temp.ik('k2')), 0, 'valid links from an IP leave no counter');
update private.rsvp_attempts set locked_until = now() - interval '1 second', window_start = now() - interval '1 hour' where key_hash = pg_temp.ik('k1');
select is(public.rsvp_gate(pg_temp.h('bad-x'), pg_temp.ik('k1')) ->> 'blocked', 'false', 'the block ends with its time');
select public.rsvp_page(pg_temp.h('bad-12'), pg_temp.ik('k1')) as x \gset ign_
select is((select failed_count || ':' || (locked_until is null)::text from private.rsvp_attempts where key_hash = pg_temp.ik('k1')), '1:true', 'and the count restarts');
-- own cleanup: old unlocked rows go, locked ones stay
insert into private.rsvp_attempts (key_hash, failed_count, window_start, locked_until) values
  (pg_temp.ik('old-free'), 3, now() - interval '2 hours', null),
  (pg_temp.ik('old-locked'), 10, now() - interval '2 hours', now() + interval '5 minutes');
insert into private.rsvp_attempts (key_hash, failed_count, window_start, locked_until) values
  (pg_temp.ik('mid'), 3, now() - interval '10 minutes', null),
  (pg_temp.ik('old20'), 3, now() - interval '20 minutes', null);
select is((select l.max_ip || ':' || l.max_link || ':' || l.win || ':' || l.lock_for from private.rsvp_limits() l), '10:20:00:15:00:00:15:00', 'the limits live in ONE function (10 per IP, 20 per link, 15 min window, 15 min lock)');
select public.rsvp_page(pg_temp.h('bad-gc'), pg_temp.ik('k5')) as x \gset gc_
select is((select count(*)::int from private.rsvp_attempts where key_hash = pg_temp.ik('mid')), 1, 'cleanup follows the limits: a row inside the window (10 min) is kept');
select is((select count(*)::int from private.rsvp_attempts where key_hash = pg_temp.ik('old20')), 0, 'and one past the window (20 min) is dropped');
select is((select count(*)::int from private.rsvp_attempts where key_hash = pg_temp.ik('old-free')), 0, 'cleanup: a finished unlocked window is dropped');
select is((select count(*)::int from private.rsvp_attempts where key_hash = pg_temp.ik('old-locked')), 1, 'cleanup: a locked row is kept');
select is((select count(*)::int from private.rsvp_attempts where key_hash = pg_temp.ik('k1')), 1, 'cleanup: a fresh row is kept');
select is((select count(*)::int from public.audit_log where table_name like 'rsvp\_%' and op = 'INSERT' and new_data::text like '%attempt%'), 0, 'the limiter is not audited');

-- Opening a page writes nothing of the wedding (AC10, QA-11)
select (select count(*) from public.rsvp_responses) as c1, (select count(*) from public.rsvp_links) as c2, (select count(*) from public.guests) as c3,
  (select count(*) from public.audit_log) as c4, (select count(*) from public.rsvp_link_people) as c5,
  (select max(updated_at)::text from public.rsvp_links) as c6 \gset op_
select public.rsvp_page(pg_temp.h('gt'), pg_temp.ik('k6')) as x \gset ign2_
select public.rsvp_page(pg_temp.h('nothing'), pg_temp.ik('k6')) as x \gset ign3_
select public.rsvp_gate(pg_temp.h('gt'), pg_temp.ik('k6')) as x \gset ign4_
select is((select count(*) from public.rsvp_responses)::text || (select count(*) from public.rsvp_links) || (select count(*) from public.guests) || (select count(*) from public.audit_log) || (select count(*) from public.rsvp_link_people) || (select max(updated_at)::text from public.rsvp_links),
  :'op_c1' || :'op_c2' || :'op_c3' || :'op_c4' || :'op_c5' || :'op_c6', 'opening a valid or invalid link (page and gate) changes no row of the wedding, audit included');

-- ===== rsvp_submit: writes (AC4, AC5, AC11, PO-1) ========================================================
select public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(
  pg_temp.ans(:'mario'::uuid, 'yes', array['vegan', 'gluten_free'], 'Allergia fittizia alle noci'),
  pg_temp.ans(:'gigi'::uuid, 'no'),
  pg_temp.ans(:'neo'::uuid, null))) as r \gset s1_
select is(pg_temp.keys(:'s1_r'::jsonb), array['changed_meanwhile', 'ok', 'people']::text[], 'submit: ok, people, changed_meanwhile');
select is(:'s1_r'::jsonb -> 'changed_meanwhile', '[]'::jsonb, 'first answers: nothing changed meanwhile');
select is((select array_agg(coalesce(e ->> 'status', '-') order by e ->> 'first_name') from jsonb_array_elements(:'s1_r'::jsonb -> 'people') e), array['no', 'yes', '-']::text[], 'the answer returns the saved state; the person with no choice stays "In attesa"');
select is((select status || ':' || diet::text || ':' || diet_note || ':' || source from public.rsvp_responses where id = :'mario'::uuid), 'yes:{vegan,gluten_free}:Allergia fittizia alle noci:guest', 'saved with source = guest');
select is((select count(*)::int from public.rsvp_responses where id = :'neo'::uuid), 0, 'status null: no write at all (no choice)');
select answered_at::text as ans0, version as ver0 from public.rsvp_responses where id = :'mario'::uuid \gset m0_
select count(*) as n from public.audit_log where table_name = 'rsvp_responses' \gset aud0_
update public.rsvp_responses set answered_at = answered_at - interval '1 hour' where id = :'mario'::uuid;
select answered_at::text as ans1, version as ver1 from public.rsvp_responses where id = :'mario'::uuid \gset m1_
select count(*) as n from public.audit_log where table_name = 'rsvp_responses' \gset aud1_
select public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(
  pg_temp.ans(:'mario'::uuid, 'yes', array['vegan', 'gluten_free'], 'Allergia fittizia alle noci', :'m1_ans1'))) as r \gset s2_
select is((select answered_at::text || ':' || version from public.rsvp_responses where id = :'mario'::uuid), :'m1_ans1' || ':' || :'m1_ver1', 'an identical resubmit leaves answered_at and version alone (AC11)');
select is((select count(*) from public.audit_log where table_name = 'rsvp_responses'), :'aud1_n'::bigint, 'and adds no audit row');
select is(:'s2_r'::jsonb -> 'changed_meanwhile', '[]'::jsonb, 'seen_at equal to the saved one: nothing changed meanwhile');
select public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(
  pg_temp.ans(:'mario'::uuid, 'no', null, null, '2000-01-01T00:00:00Z'),
  pg_temp.ans(:'gigi'::uuid, 'yes', array['vegetarian'], null, null),
  pg_temp.ans(:'neo'::uuid, 'yes', null, null, '2030-01-01T00:00:00Z'))) as r \gset s3_
select is((select array_agg(x order by x) from jsonb_array_elements_text(:'s3_r'::jsonb -> 'changed_meanwhile') x),
  array[:'mario', :'gigi', :'neo']::text[], 'PO-1: a stale seen_at, a missing seen_at on an existing answer and a seen_at for a missing answer all report changed_meanwhile');
select is((select status || ':' || diet::text || ':' || coalesce(diet_note, '-') from public.rsvp_responses where id = :'mario'::uuid), 'no:{}:-', 'the choice is saved anyway (last one wins) and "no" cleared the preferences');
select public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'no', array['vegan'], 'ignored'))) as r \gset ign5_
select is((select diet::text || ':' || coalesce(diet_note, '-') from public.rsvp_responses where id = :'mario'::uuid), '{}:-', 'a "no" sent with preferences stores none');
select public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'no'), pg_temp.ans(:'mario'::uuid, 'yes', array['vegan']))) as r \gset ign6_
select is((select status from public.rsvp_responses where id = :'mario'::uuid), 'yes', 'a repeated id: the last one wins (yes)');
select public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'yes', array['vegan']), pg_temp.ans(:'mario'::uuid, 'no'))) as r \gset ign7_
select is((select status from public.rsvp_responses where id = :'mario'::uuid), 'no', 'and the other way round');
-- people that are not the link's: ignored (AC11)
select public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(
  pg_temp.ans('c6000000-0000-4000-8000-000000000004', 'yes'), pg_temp.ans('c6000000-0000-4000-8000-000000000005', 'yes'),
  pg_temp.ans('c6000000-0000-4000-8000-000000000007', 'yes'), pg_temp.ans(:'mario2'::uuid, 'yes'), pg_temp.ans(gen_random_uuid(), 'yes'))) as r \gset s6_
select is(:'s6_r'::jsonb ->> 'ok', 'true', 'ids outside the current people are ignored without an error');
select is((select count(*)::int from public.rsvp_responses where id in ('c6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000005', 'c6000000-0000-4000-8000-000000000007', :'mario2')), 0,
  'and nothing is written for another group, a deleted person, another wedding or an unknown id');
select is((select count(*)::int from public.rsvp_responses where wedding_id = :'w2_wedding'::uuid), 0, 'W2 untouched');
-- somebody leaves the group while the form is open: ignored
update public.guests set group_id = null where id = :'gigi'::uuid;
select public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'gigi'::uuid, 'no'), pg_temp.ans(:'neo'::uuid, 'no'))) as r \gset s7_
select is((select array_agg(e ->> 'first_name' order by e ->> 'first_name') from jsonb_array_elements(:'s7_r'::jsonb -> 'people') e), array['Mario', 'Neo']::text[], 'AC11: a person who left is no longer in the answer');
select is((select status from public.rsvp_responses where id = :'gigi'::uuid), 'yes', 'and their answer was not touched by this submit');
update public.guests set group_id = 'a6000000-0000-4000-8000-000000000001' where id = :'gigi'::uuid;

-- seen_at is compared at microsecond precision: the untouched string round-trips, a truncated one does not (REV-4)
update public.rsvp_responses set answered_at = timestamptz '2026-01-01 10:00:00.123456+00' where id = :'mario'::uuid;
select e ->> 'answered_at' as us_ts from jsonb_array_elements(public.rsvp_page(pg_temp.h('gt'), null) -> 'people') e where e ->> 'id' = :'mario' \gset
select is(:'us_ts'::text, '2026-01-01T10:00:00.123456+00:00'::text, 'the page carries answered_at with microseconds');
select is(public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'no', null, null, :'us_ts'))) -> 'changed_meanwhile', '[]'::jsonb,
  'sending the untouched string back: nothing changed meanwhile');
update public.rsvp_responses set answered_at = timestamptz '2026-01-01 10:00:00.123456+00' where id = :'mario'::uuid;
select is((public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'no', null, null, '2026-01-01T10:00:00.123+00:00'))) -> 'changed_meanwhile') ->> 0, :'mario',
  'a value truncated to milliseconds (a client that parsed and re-serialised it) reports a change: T7 must pass the string through');

-- ===== Validation: invalid_answers, never a 500, nothing written (QA-8) =================================
select count(*) as n from public.rsvp_responses \gset v0_
select throws_ok(format($$select public.rsvp_submit(pg_temp.h('gt'), null, %L::jsonb)$$, v.p), 'P0001', 'invalid_answers', 'invalid_answers: ' || v.n)
from (values
  ('empty array', '[]'), ('not an array', '{"id":"x"}'), ('a string', '"x"'), ('item not an object', '["x"]'),
  ('missing id', '[{"status":"yes"}]'), ('bad id', '[{"id":"nope","status":"yes"}]'), ('numeric id', '[{"id":5,"status":"yes"}]'),
  ('status maybe', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"maybe"}]'),
  ('status number', '[{"id":"c6000000-0000-4000-8000-000000000001","status":1}]'),
  ('diet not array', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"yes","diet":"vegan"}]'),
  ('diet value', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"yes","diet":["kosher"]}]'),
  ('diet duplicates', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"yes","diet":["vegan","vegan"]}]'),
  ('diet not strings', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"yes","diet":[1]}]'),
  ('note too long (201)', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"yes","diet_note":"' || repeat('n', 201) || '"}]'),
  ('note of spaces', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"yes","diet_note":"   "}]'),
  ('note not a string', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"yes","diet_note":5}]'),
  ('seen_at garbage', '[{"id":"c6000000-0000-4000-8000-000000000001","status":"yes","seen_at":"ieri"}]'),
  ('one bad item among good ones', '[{"id":"c6000000-0000-4000-8000-000000000002","status":"no"},{"id":"c6000000-0000-4000-8000-000000000001","status":"zzz"}]'),
  ('101 items', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'status', 'yes'))::text from generate_series(1, 101)))
) v (n, p);
select throws_ok($$select public.rsvp_submit(pg_temp.h('gt'), null, null)$$, 'P0001', 'invalid_answers', 'invalid_answers: null');
select is((select count(*) from public.rsvp_responses), :'v0_n'::bigint, 'and none of them wrote anything (all or nothing)');
select lives_ok(format($$select public.rsvp_submit(pg_temp.h('gt'), null, %L::jsonb)$$, (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'status', 'yes')) from generate_series(1, 100))), '100 items are accepted');
select is(public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'yes', null, repeat('n', 200)))) ->> 'ok', 'true', 'a note of exactly 200 characters is accepted');
select is(public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'yes', array['vegetarian', 'vegan', 'gluten_free', 'lactose_free'], '<script>alert(1)</script> 🍝'))) ->> 'ok', 'true', 'text with <script> and emoji is plain data, stored as typed');
select is((select diet_note from public.rsvp_responses where id = :'mario'::uuid), '<script>alert(1)</script> 🍝', 'stored verbatim (the page renders it as text)');
select is(public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, null, array['vegan']))) ->> 'ok', 'true', 'status null with preferences: valid, no write');
-- a bad payload on a link that does not work is the neutral answer, not an error
select is(public.rsvp_submit(pg_temp.h('revoked'), null, '[]'), '{"ok": false}'::jsonb, 'revoked link + invalid payload: neutral, no error (cannot tell the causes apart)');
select is(public.rsvp_submit(pg_temp.h('nope'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'yes'))), '{"ok": false}'::jsonb, 'unknown token: neutral (the same content for every cause, AC6)');
select is(public.rsvp_submit(null, null, null), '{"ok": false}'::jsonb, 'null token and payload: neutral');

-- ===== Per-link limit: 20 submits / 15 min, counted before the writes (BR9, QA-9) =========================
select count(*) filter (where r ->> 'ok' = 'true') as okc from (select public.rsvp_submit(pg_temp.h('lia'), null, jsonb_build_array(pg_temp.ans(:'lia'::uuid, case when i % 2 = 0 then 'yes' else 'no' end))) r from generate_series(1, 20) i) x \gset lim_
select is(:lim_okc::int, 20, 'the first 20 submits of a link are accepted');
select public.rsvp_submit(pg_temp.h('lia'), null, jsonb_build_array(pg_temp.ans(:'lia'::uuid, 'yes', array['vegan']))) as r \gset l21_
select is(pg_temp.keys(:'l21_r'::jsonb), array['blocked', 'ok', 'retry_after_seconds']::text[], 'the 21st: ok false + blocked + retry_after_seconds');
select is(:'l21_r'::jsonb ->> 'blocked', 'true', 'the 21st is blocked');
select ok((:'l21_r'::jsonb ->> 'retry_after_seconds')::int between 1 and 900, 'with a retry in (0, 900]');
select is((select diet::text from public.rsvp_responses where id = :'lia'::uuid), '{}', 'the blocked submit wrote nothing (no preferences saved)');
select is(public.rsvp_submit(pg_temp.h('lia'), pg_temp.ik('k7'), jsonb_build_array(pg_temp.ans(:'lia'::uuid, 'no'))) ->> 'blocked', 'true', 'the link limit does not depend on the IP');
select is(public.rsvp_submit(pg_temp.h('gt'), null, jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'no'))) ->> 'ok', 'true', 'another link is not affected');
select is(public.rsvp_page(pg_temp.h('lia'), null) ->> 'ok', 'true', 'a blocked link can still be OPENED (the limit is on submits)');
update private.rsvp_attempts set locked_until = now() - interval '1 second', window_start = now() - interval '1 hour' where key_hash = extensions.digest('d6000000-0000-4000-8000-000000000003', 'sha256');
select is(public.rsvp_submit(pg_temp.h('lia'), null, jsonb_build_array(pg_temp.ans(:'lia'::uuid, 'yes'))) ->> 'ok', 'true', 'after the lock the link accepts submits again');
-- dead links submitted from an IP feed the IP limit
select count(*) as n from (select public.rsvp_submit(pg_temp.h('dead-' || i), pg_temp.ik('k8'), jsonb_build_array(pg_temp.ans(:'mario'::uuid, 'yes'))) from generate_series(1, 10) i) x \gset dead_
select is(public.rsvp_gate(pg_temp.h('dead-x'), pg_temp.ik('k8')) ->> 'blocked', 'true', 'dead links tried through submit count on the IP too');

-- ===== Audit: no answer or preference value anywhere (AC14) ===============================================
select is((select count(*)::int from public.audit_log a where a.table_name in ('rsvp_responses', 'rsvp_links')
  and (coalesce(a.old_data, '{}'::jsonb) ?| array['status', 'diet', 'diet_note', 'token_hash'] or coalesce(a.new_data, '{}'::jsonb) ?| array['status', 'diet', 'diet_note', 'token_hash'])),
  0, 'the audit of the answers written through the public RPC carries no status, diet, note or token_hash');
select is((select count(*)::int from public.audit_log a where a.table_name like 'rsvp\_%' and (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '')) ~* 'allergia|script|vegan|gluten'), 0, 'and no preference value');
select cmp_ok((select count(*)::int from public.audit_log where table_name = 'rsvp_responses' and actor_id is null), '>', 0, 'the audit is not vacuous (written by the public RPC: no actor)');

select * from finish();
rollback;
