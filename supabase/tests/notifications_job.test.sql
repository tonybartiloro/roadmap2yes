-- T9: job_* functions (plan §7): recipients (only members, D44), idempotent claims (AC53), expired
-- claims resumed with the same batch_key, daily/monthly caps with skipped_quota, opt-out and
-- one-click unsubscribe (AC52). Time is injected through the p_now parameter.
begin;
\set su 'reset role; do $x$ begin perform set_config(''request.jwt.claims'','''',true); perform set_config(''request.jwt.claim.sub'','''',true); end $x$;'
select plan(69);

select * from tests.make_wedding('nj1') \gset w1_
select * from tests.make_wedding('nj2') \gset w2_
-- B of wedding 1: has an account and a partner row, but NO membership yet (never logged in)
select tests.make_user('nj1.b@example.test') as b1 \gset
insert into public.wedding_partners (wedding_id, slot, email) values (:'w1_wedding'::uuid, 'B', 'nj1.b@example.test');
select tests.login_service();

-- recipients: D44
select is((select array_agg(email order by email) from public.job_recipients() where email like 'nj%'),
  array['nj1.a@example.test', 'nj2.a@example.test']::text[], 'recipients are members only: B without membership is not listed');
select is((select reminders_enabled and digest_enabled from public.job_recipients() where email = 'nj1.a@example.test'), true, 'defaults: both on');
:su
insert into public.memberships (wedding_id, user_id, role, partner_slot) values (:'w1_wedding'::uuid, :'b1'::uuid, 'partner', 'B');
update public.wedding_partners set user_id = :'b1'::uuid where wedding_id = :'w1_wedding'::uuid and slot = 'B';
select tests.login_service();
select is((select count(*)::int from public.job_recipients() where wedding_id = :'w1_wedding'::uuid), 2, 'after the first login B is a recipient');
select is((select partner_slot from public.job_recipients() where email = 'nj1.b@example.test'), 'B', 'slot is returned');

-- not a member of that wedding
select throws_ok(format($$select public.job_claim_notification(%L, %L, 'reminder', 'x1')$$, :'b1'::uuid, :'w2_wedding'::uuid),
  'P0001', 'not_member', 'claim requires membership of that wedding');
select throws_ok(format($$select public.job_claim_notification(%L, %L, 'weekly', 'x2')$$, :'w1_founder'::uuid, :'w1_wedding'::uuid),
  'P0001', 'invalid_kind', 'unknown kind refused');
select throws_ok(format($$select public.job_claim_notification(%L, %L, 'reminder', '')$$, :'w1_founder'::uuid, :'w1_wedding'::uuid),
  'P0001', 'invalid_argument', 'empty batch_key refused');

-- first claim, repeat, mark sent, repeat
select is((public.job_claim_notification(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'reminder', 'reminder:a:2027-01-10',
  array['task_7d:t1:2027-01-17'], 50, 1500, '2027-01-10 05:00+00'))->>'status', 'claimed', 'first claim');
select is((public.job_claim_notification(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'reminder', 'reminder:a:2027-01-10',
  '{}', 50, 1500, '2027-01-10 05:01+00'))->>'status', 'in_progress', 'second run while the claim is fresh: nothing to do');
select is((select status from public.notification_log where batch_key = 'reminder:a:2027-01-10'), 'claimed', 'row is claimed');
select is((select attempts from public.notification_log where batch_key = 'reminder:a:2027-01-10'), 1, 'one attempt');
select is(public.job_mark_notification_sent((select id from public.notification_log where batch_key = 'reminder:a:2027-01-10'), '2027-01-10 05:02+00'),
  'sent', 'mark sent');
select is(public.job_mark_notification_sent((select id from public.notification_log where batch_key = 'reminder:a:2027-01-10')),
  'sent', 'mark sent is idempotent');
select is((public.job_claim_notification(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'reminder', 'reminder:a:2027-01-10',
  '{}', 50, 1500, '2027-01-10 06:00+00'))->>'status', 'already_sent', 'after sent: never again');
select is((public.job_claim_notification(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'reminder', 'reminder:a:2027-01-10',
  '{}', 50, 1500, '2027-02-10 06:00+00'))->>'status', 'already_sent', 'still sent much later');
select throws_ok(format($$select public.job_claim_notification(%L, %L, 'reminder', 'reminder:a:2027-01-10')$$, :'b1'::uuid, :'w1_wedding'::uuid),
  'P0001', 'batch_key_conflict', 'a batch_key belongs to one user');
select is(public.job_sent_item_keys(:'w1_founder'::uuid, '2027-01-01+00'), array['task_7d:t1:2027-01-17']::text[], 'item keys are queryable for dedupe');
select is(public.job_sent_item_keys(:'w1_founder'::uuid, '2027-03-01+00'), '{}'::text[], 'item keys respect `since`');
select is(public.job_sent_item_keys(:'b1'::uuid, '2027-01-01+00'), '{}'::text[], 'item keys are per user');

-- expired claim (15 minutes) resumed with the same key; failure resumed too
select is((public.job_claim_notification(:'b1'::uuid, :'w1_wedding'::uuid, 'reminder', 'reminder:b:2027-01-10',
  '{}', 50, 1500, '2027-01-10 05:00+00'))->>'status', 'claimed', 'B claim');
select is((public.job_claim_notification(:'b1'::uuid, :'w1_wedding'::uuid, 'reminder', 'reminder:b:2027-01-10',
  '{}', 50, 1500, '2027-01-10 05:14+00'))->>'status', 'in_progress', 'claim younger than 15 minutes is respected');
select is((public.job_claim_notification(:'b1'::uuid, :'w1_wedding'::uuid, 'reminder', 'reminder:b:2027-01-10',
  '{}', 50, 1500, '2027-01-10 05:16+00'))->>'status', 'resumed', 'claim older than 15 minutes is resumed');
select is((select attempts from public.notification_log where batch_key = 'reminder:b:2027-01-10'), 2, 'resume counts an attempt');
select is((select count(*)::int from public.notification_log where batch_key = 'reminder:b:2027-01-10'), 1, 'same row, same batch_key');
select is(public.job_fail_notification((select id from public.notification_log where batch_key = 'reminder:b:2027-01-10'), 'smtp timeout'),
  'failed', 'a failed send is recorded');
select is((public.job_claim_notification(:'b1'::uuid, :'w1_wedding'::uuid, 'reminder', 'reminder:b:2027-01-10',
  '{}', 50, 1500, '2027-01-10 05:17+00'))->>'status', 'resumed', 'failed batch is retried with the same key');
select is(public.job_fail_notification((select id from public.notification_log where batch_key = 'reminder:a:2027-01-10')),
  'sent', 'a sent row is never downgraded');
select throws_ok($$select public.job_mark_notification_sent(-1)$$, 'P0001', 'not_found', 'unknown id');

-- caps: daily 2, monthly 1500
select is((public.job_claim_notification(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'digest', 'digest:a:2027-W02',
  '{}', 2, 1500, '2027-01-10 05:20+00'))->>'status', 'skipped_quota', 'daily cap reached (2 already claimed today)');
select is((public.job_claim_notification(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'digest', 'digest:a:2027-W02',
  '{}', 2, 1500, '2027-01-10 05:21+00'))->'reason', '"daily"'::jsonb, 'reason is daily');
select is((select status from public.notification_log where batch_key = 'digest:a:2027-W02'), 'skipped_quota', 'skipped row recorded');
select is((public.job_quota_status('2027-01-10 12:00+00'))->>'skipped_today', '1', 'quota status reports the skip (flag source)');
select is((public.job_quota_status('2027-01-10 12:00+00'))->>'sent_today', '2', 'quota status counts claimed+sent');
select is((public.job_claim_notification(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'digest', 'digest:a:2027-W02',
  '{}', 2, 1500, '2027-01-11 05:00+00'))->>'status', 'claimed', 'next day the skipped batch is re-evaluated and claimed');
select is((select count(*)::int from public.notification_log where batch_key = 'digest:a:2027-W02'), 1, 'still one row');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:c:2027-01-11',
  '{}', 50, 2, '2027-01-11 05:00+00'))->'reason', '"monthly"'::jsonb, 'monthly cap reached (3 claimed/sent this month, cap 2)');

-- opt-out and one-click unsubscribe (AC52)
select lives_ok(format($$select public.job_unsubscribe(%L, 'digest')$$, :'w1_founder'::uuid), 'unsubscribe from the digest');
select lives_ok(format($$select public.job_unsubscribe(%L, 'digest')$$, :'w1_founder'::uuid), 'idempotent');
select is((select digest_enabled from public.notification_preferences where user_id = :'w1_founder'::uuid), false, 'digest off');
select is((select reminders_enabled from public.notification_preferences where user_id = :'w1_founder'::uuid), true, 'reminders untouched');
select is((public.job_claim_notification(:'w1_founder'::uuid, :'w1_wedding'::uuid, 'digest', 'digest:a:2027-W03',
  '{}', 50, 1500, '2027-01-18 05:00+00'))->>'status', 'opted_out', 'opted-out kind is never claimed');
select is((select count(*)::int from public.notification_log where batch_key = 'digest:a:2027-W03'), 0, 'no row for an opted-out kind');
select throws_ok(format($$select public.job_unsubscribe(%L, 'invite')$$, :'w1_founder'::uuid), 'P0001', 'invalid_kind', 'only reminders|digest can be switched off');
select throws_ok(format($$select public.job_unsubscribe(%L, 'reminders')$$, gen_random_uuid()), 'P0001', 'not_member', 'unknown user');

-- REV-3: an email that really left is sent, even after a stale sender marked the row failed
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:r3',
  '{}', 50, 1500, '2027-03-05 05:00+00'))->>'status', 'claimed', 'r3: claimed');
select is(public.job_fail_notification((select id from public.notification_log where batch_key = 'reminder:u2:r3'), 'stale sender'),
  'failed', 'r3: a stale sender marks it failed');
select is(public.job_mark_notification_sent((select id from public.notification_log where batch_key = 'reminder:u2:r3'), '2027-03-05 05:01+00'),
  'sent', 'r3: mark-sent accepts a failed row');
select is((select status from public.notification_log where batch_key = 'reminder:u2:r3'), 'sent', 'r3: ledger says sent');

-- REV-1: a resumed failure re-passes the cap (daily cap 2)
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:x1',
  '{}', 2, 1500, '2027-03-06 05:00+00'))->>'status', 'claimed', 'x1 claimed');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:x2',
  '{}', 2, 1500, '2027-03-06 05:01+00'))->>'status', 'claimed', 'x2 claimed');
select is(public.job_fail_notification((select id from public.notification_log where batch_key = 'reminder:u2:x2'), 'boom'), 'failed', 'x2 failed (not counted)');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:x3',
  '{}', 2, 1500, '2027-03-06 05:02+00'))->>'status', 'claimed', 'x3 takes the free slot');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:x2',
  '{}', 2, 1500, '2027-03-06 05:03+00'))->>'status', 'skipped_quota', 'resuming x2 at the cap is refused (51st email)');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:x2',
  '{}', 2, 1500, '2027-03-06 05:04+00'))->'reason', '"daily"'::jsonb, 'x2: reason daily');
select is((select status from public.notification_log where batch_key = 'reminder:u2:x2'), 'failed', 'x2 stays failed');

-- REV-1: an old claim resumed on a later day counts on that day and re-passes the cap (daily cap 1)
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:y',
  '{}', 1, 1500, '2027-03-07 23:00+00'))->>'status', 'claimed', 'y claimed late in the evening');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:z',
  '{}', 1, 1500, '2027-03-08 04:00+00'))->>'status', 'claimed', 'z claimed the next morning');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:y',
  '{}', 1, 1500, '2027-03-08 05:00+00'))->>'status', 'skipped_quota', 'y resumed on a full day is refused');

-- REV-2: poison batch (expired claims) stops after 5 attempts
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:poison',
  '{}', 50, 1500, '2027-04-01 05:00+00'))->>'status', 'claimed', 'poison: attempt 1');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:poison',
  '{}', 50, 1500, '2027-04-01 05:20+00'))->>'status', 'resumed', 'poison: attempt 2');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:poison',
  '{}', 50, 1500, '2027-04-01 05:40+00'))->>'status', 'resumed', 'poison: attempt 3');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:poison',
  '{}', 50, 1500, '2027-04-01 06:00+00'))->>'status', 'resumed', 'poison: attempt 4');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:poison',
  '{}', 50, 1500, '2027-04-01 06:20+00'))->>'status', 'resumed', 'poison: attempt 5');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:poison',
  '{}', 50, 1500, '2027-04-01 06:40+00'))->>'status', 'failed_final', 'poison: failed_final after 5 attempts');
select is((select status from public.notification_log where batch_key = 'reminder:u2:poison'), 'failed', 'poison row is failed');
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:poison',
  '{}', 50, 1500, '2027-04-02 06:40+00'))->>'status', 'failed_final', 'failed_final is stable');

-- REV-2: failed path
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:q',
  '{}', 50, 1500, '2027-05-01 05:00+00'))->>'status', 'claimed', 'q claimed');
select is(public.job_fail_notification((select id from public.notification_log where batch_key = 'reminder:u2:q'), 'x'), 'failed', 'q failed');
:su
update public.notification_log set attempts = 5 where batch_key = 'reminder:u2:q';
select tests.login_service();
select is((public.job_claim_notification(:'w2_founder'::uuid, :'w2_wedding'::uuid, 'reminder', 'reminder:u2:q',
  '{}', 50, 1500, '2027-05-01 05:30+00'))->>'status', 'failed_final', 'failed batch with 5 attempts is final');

select * from finish();
rollback;
