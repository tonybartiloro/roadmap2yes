-- T2: login limiter (AC54, R23), Auth lookup, heartbeat and per-user state RPCs.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(31);

select * from tests.make_wedding('l1') \gset w1_
select tests.make_user('l.someone@example.test') as someone \gset

-- secret-key-only functions
select tests.login(:'w1_founder'::uuid);
select throws_ok($$select public.login_gate(decode(repeat('01', 32), 'hex'), null)$$, '42501', null, 'authenticated cannot call login_gate');
select throws_ok($$select public.record_heartbeat('daily_job')$$, '42501', null, 'authenticated cannot call record_heartbeat');
select throws_ok($$select public.auth_user_id_by_email('l.someone@example.test')$$, '42501', null, 'authenticated cannot call auth_user_id_by_email');
:su
select tests.login_anon();
select throws_ok($$select public.login_gate(decode(repeat('01', 32), 'hex'), null)$$, '42501', null, 'anon cannot call login_gate');
:su

-- limiter
select tests.login_service();
select is((public.login_gate(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex')) ->> 'blocked')::boolean, false, 'fresh key not blocked');
select public.login_record(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), false);
select public.login_record(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), false);
select public.login_record(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), false);
select public.login_record(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), false);
select is((public.login_gate(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex')) ->> 'blocked')::boolean, false, '4 failures: not blocked');
select is((public.login_record(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), false) ->> 'blocked')::boolean, true, '5th failure blocks the email key');
select cmp_ok((public.login_gate(decode(repeat('01', 32), 'hex'), null) ->> 'retry_after_seconds')::int, '>', 800, 'locked for ~15 minutes');
-- REV-5: a success never erases an active lock, and never clears the IP key; a failure while
-- locked does not extend the lock or the count.
select public.login_record(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), true);
select is((public.login_gate(decode(repeat('01', 32), 'hex'), null) ->> 'blocked')::boolean, true, 'success while locked leaves the email lock');
select cmp_ok((public.login_gate(decode(repeat('01', 32), 'hex'), null) ->> 'retry_after_seconds')::int, '>', 800, 'and does not shorten it');
select public.login_record(decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), false);
:su
select is((select failed_count from private.login_attempts where key_hash = decode(repeat('01', 32), 'hex')), 5, 'a failure while locked does not extend the count');
select is((select failed_count from private.login_attempts where key_hash = decode(repeat('02', 32), 'hex')), 6, 'a success never clears the IP key');
select tests.login_service();
select is((public.login_gate(decode(repeat('03', 32), 'hex'), decode(repeat('02', 32), 'hex')) ->> 'blocked')::boolean, false, 'other email with a not yet blocked IP: open');
select is((public.login_gate(decode(repeat('03', 32), 'hex'), null) ->> 'blocked')::boolean, false, 'unrelated email key unaffected');

-- IP key blocks every email at 20 failures
select public.login_record(decode(lpad(to_hex(g), 2, '0') || repeat('ff', 31), 'hex'), decode(repeat('04', 32), 'hex'), false) from generate_series(1, 19) g;
select is((public.login_gate(decode(repeat('99', 32), 'hex'), decode(repeat('04', 32), 'hex')) ->> 'blocked')::boolean, false, 'IP at 19: open');
select public.login_record(decode(repeat('98', 32), 'hex'), decode(repeat('04', 32), 'hex'), false);
select is((public.login_gate(decode(repeat('97', 32), 'hex'), decode(repeat('04', 32), 'hex')) ->> 'blocked')::boolean, true, 'IP at 20: blocked for any email');

-- unlock after the window (timestamps moved) and success clears the counter
:su
update private.login_attempts set locked_until = now() - interval '1 second', window_start = now() - interval '16 minutes';
select tests.login_service();
select is((public.login_gate(decode(repeat('01', 32), 'hex'), null) ->> 'blocked')::boolean, false, 'unlocked after 15 minutes');
select public.login_record(decode(repeat('01', 32), 'hex'), null, false);
:su
select is((select failed_count from private.login_attempts where key_hash = decode(repeat('01', 32), 'hex')), 1, 'a failure after the window restarts the count');
select tests.login_service();
select public.login_record(decode(repeat('01', 32), 'hex'), null, true);
:su
select is((select count(*)::int from private.login_attempts where key_hash = decode(repeat('01', 32), 'hex')), 0, 'success clears the email counter');
select tests.login_service();
select throws_ok($$select public.login_gate(decode('abcd', 'hex'), null)$$, 'P0001', 'invalid_key', 'key must be a sha256 digest');

-- Auth lookup and heartbeat
select is(public.auth_user_id_by_email(' L.Someone@Example.test '), :'someone'::uuid, 'auth_user_id_by_email normalizes');
select is(public.auth_user_id_by_email('l.nobody@example.test'), null, 'unknown email gives null');
select lives_ok($$select public.record_heartbeat('daily_job', '{"ok":true}')$$, 'record_heartbeat');
:su
select tests.login(:'w1_founder'::uuid);
select isnt(public.last_heartbeat(), null::timestamptz, 'members read the last heartbeat');
:su
select tests.login(:'someone'::uuid);
select throws_ok($$select public.last_heartbeat()$$, '42501', 'forbidden', 'non members cannot');

-- per-user state
:su
select tests.login(:'w1_founder'::uuid);
select is(public.record_seen() ->> 'previous_seen_at', null, 'first visit: previous_seen_at is null');
select isnt(public.record_seen() ->> 'previous_seen_at', null, 'second visit moves last_seen_at into previous_seen_at');
select isnt(public.dismiss_welcome() ->> 'welcome_dismissed_at', null, 'dismiss_welcome');
select isnt(public.record_export() ->> 'last_export_at', null, 'record_export');
select is((select count(*)::int from public.user_wedding_state), 1, 'own state row readable');
select throws_ok($$update public.user_wedding_state set last_export_at = null$$, '42501', null, 'state not directly writable');

select * from finish();
rollback;
