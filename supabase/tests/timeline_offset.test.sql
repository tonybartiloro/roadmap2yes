-- T8: private.add_date_offset passes EVERY shared vector (plan §5, R8): months first with
-- end-of-month clamp, then weeks and days; negative offsets move after the reference.
-- GENERATED from tests/fixtures/date-offset-vectors.json (sha256 85f9beccbda38ca8, 65 vectors).
-- pgTAP cannot read the repo file (it runs in a container), so the rows are embedded: if the JSON
-- changes, regenerate the INSERT below from it and update the plan count (vectors + 3).
begin;
select plan(68);

create temp table vectors (reference date, "offset" jsonb, expected date, note text) on commit drop;
insert into vectors values
  ('2027-08-31'::date, '{"months":12}'::jsonb, '2026-08-31'::date, 'end of month: 12m'),
  ('2027-08-31'::date, '{"months":11}'::jsonb, '2026-09-30'::date, 'end of month: 11m clamp 31->30'),
  ('2027-08-31'::date, '{"months":10}'::jsonb, '2026-10-31'::date, 'end of month: 10m'),
  ('2027-08-31'::date, '{"months":9}'::jsonb, '2026-11-30'::date, 'end of month: 9m clamp'),
  ('2027-08-31'::date, '{"months":8}'::jsonb, '2026-12-31'::date, 'end of month: 8m'),
  ('2027-08-31'::date, '{"months":7}'::jsonb, '2027-01-31'::date, 'end of month: 7m'),
  ('2027-08-31'::date, '{"months":6}'::jsonb, '2027-02-28'::date, 'end of month: 6m clamp to 28 (non-leap)'),
  ('2027-08-31'::date, '{"months":5}'::jsonb, '2027-03-31'::date, 'end of month: 5m'),
  ('2027-08-31'::date, '{"months":4}'::jsonb, '2027-04-30'::date, 'end of month: 4m clamp'),
  ('2027-08-31'::date, '{"months":3}'::jsonb, '2027-05-31'::date, 'end of month: 3m'),
  ('2027-08-31'::date, '{"months":2}'::jsonb, '2027-06-30'::date, 'end of month: 2m clamp'),
  ('2027-08-31'::date, '{"months":1}'::jsonb, '2027-07-31'::date, 'end of month: 1m'),
  ('2027-08-31'::date, '{"months":2,"weeks":2}'::jsonb, '2027-06-16'::date, 'discriminating: months first (-> 06-30) then -14 days; weeks first would give 06-17'),
  ('2027-08-31'::date, '{"weeks":6}'::jsonb, '2027-07-20'::date, '6 weeks'),
  ('2027-08-31'::date, '{"weeks":1}'::jsonb, '2027-08-24'::date, '1 week'),
  ('2027-08-31'::date, '{"days":3}'::jsonb, '2027-08-28'::date, '3 days'),
  ('2027-08-31'::date, '{"weeks":-2}'::jsonb, '2027-09-14'::date, 'after the date: -2 weeks'),
  ('2028-08-31'::date, '{"months":6}'::jsonb, '2028-02-29'::date, 'leap year: 6m -> 29 Feb 2028'),
  ('2028-08-31'::date, '{"months":12}'::jsonb, '2027-08-31'::date, '12m'),
  ('2028-08-31'::date, '{"months":11}'::jsonb, '2027-09-30'::date, '11m clamp'),
  ('2028-08-31'::date, '{"months":2,"weeks":2}'::jsonb, '2028-06-16'::date, '2m+2w'),
  ('2028-05-01'::date, '{"months":12}'::jsonb, '2027-05-01'::date, 'period first day: 12m'),
  ('2028-05-01'::date, '{"months":9}'::jsonb, '2027-08-01'::date, '9m'),
  ('2028-05-01'::date, '{"months":6}'::jsonb, '2027-11-01'::date, '6m'),
  ('2028-05-01'::date, '{"months":3}'::jsonb, '2028-02-01'::date, '3m'),
  ('2028-05-01'::date, '{"weeks":1}'::jsonb, '2028-04-24'::date, '1w'),
  ('2027-09-03'::date, '{"months":12}'::jsonb, '2026-09-03'::date, '12m'),
  ('2027-09-03'::date, '{"months":2,"weeks":2}'::jsonb, '2027-06-19'::date, '2m+2w'),
  ('2027-09-03'::date, '{"weeks":6}'::jsonb, '2027-07-23'::date, '6w'),
  ('2027-09-03'::date, '{"weeks":4}'::jsonb, '2027-08-06'::date, '4w'),
  ('2027-09-03'::date, '{"days":3}'::jsonb, '2027-08-31'::date, '3d'),
  ('2027-09-03'::date, '{"weeks":-2}'::jsonb, '2027-09-17'::date, '-2w'),
  ('2027-09-03'::date, '{"weeks":-4}'::jsonb, '2027-10-01'::date, '-4w'),
  ('2028-02-29'::date, '{"months":12}'::jsonb, '2027-02-28'::date, 'leap day minus 12m clamps to 28 Feb'),
  ('2028-02-29'::date, '{"months":1}'::jsonb, '2028-01-29'::date, 'leap day minus 1m'),
  ('2028-02-29'::date, '{"months":-12}'::jsonb, '2029-02-28'::date, 'negative: leap day plus 12m'),
  ('2028-03-31'::date, '{"months":1}'::jsonb, '2028-02-29'::date, '31 Mar - 1m in leap year'),
  ('2028-03-30'::date, '{"months":1}'::jsonb, '2028-02-29'::date, '30 Mar - 1m in leap year'),
  ('2027-03-31'::date, '{"months":1}'::jsonb, '2027-02-28'::date, '31 Mar - 1m non-leap'),
  ('2024-02-29'::date, '{"months":-12}'::jsonb, '2025-02-28'::date, 'negative: 29 Feb 2024 plus 12m'),
  ('2027-01-31'::date, '{"months":-1}'::jsonb, '2027-02-28'::date, 'negative: 31 Jan plus 1m clamps'),
  ('2027-12-31'::date, '{"months":-2}'::jsonb, '2028-02-29'::date, 'negative: plus 2m into leap February'),
  ('2027-12-15'::date, '{"months":-1}'::jsonb, '2028-01-15'::date, 'negative: plus 1m across year'),
  ('2027-01-31'::date, '{"months":-1,"days":3}'::jsonb, '2027-02-25'::date, 'mixed signs: months applied first (+1m -> 02-28) then 3 days before'),
  ('2027-01-15'::date, '{"months":3}'::jsonb, '2026-10-15'::date, '3m across year'),
  ('2027-01-01'::date, '{"days":1}'::jsonb, '2026-12-31'::date, '1 day across year'),
  ('2026-12-31'::date, '{"days":-1}'::jsonb, '2027-01-01'::date, 'negative: +1 day across year'),
  ('2027-05-10'::date, '{}'::jsonb, '2027-05-10'::date, 'zero offset'),
  ('2027-03-28'::date, '{"days":1}'::jsonb, '2027-03-27'::date, 'DST spring (28 Mar 2027): 1d'),
  ('2027-03-28'::date, '{"days":-1}'::jsonb, '2027-03-29'::date, 'DST spring: +1d'),
  ('2027-03-28'::date, '{"weeks":1}'::jsonb, '2027-03-21'::date, 'DST spring: 1w'),
  ('2027-03-28'::date, '{"weeks":-1}'::jsonb, '2027-04-04'::date, 'DST spring: -1w'),
  ('2027-03-28'::date, '{"months":1}'::jsonb, '2027-02-28'::date, 'DST spring: 1m'),
  ('2027-03-27'::date, '{"days":-1}'::jsonb, '2027-03-28'::date, 'DST spring: day before, +1d'),
  ('2027-03-27'::date, '{"days":-2}'::jsonb, '2027-03-29'::date, 'DST spring: day before, +2d'),
  ('2027-04-01'::date, '{"days":4}'::jsonb, '2027-03-28'::date, 'DST spring: 4d'),
  ('2027-10-31'::date, '{"days":1}'::jsonb, '2027-10-30'::date, 'DST autumn (31 Oct 2027): 1d'),
  ('2027-10-31'::date, '{"days":-1}'::jsonb, '2027-11-01'::date, 'DST autumn: +1d'),
  ('2027-10-31'::date, '{"weeks":1}'::jsonb, '2027-10-24'::date, 'DST autumn: 1w'),
  ('2027-10-31'::date, '{"weeks":-1}'::jsonb, '2027-11-07'::date, 'DST autumn: -1w'),
  ('2027-10-31'::date, '{"months":1}'::jsonb, '2027-09-30'::date, 'DST autumn: 1m clamp'),
  ('2027-10-31'::date, '{"months":-1}'::jsonb, '2027-11-30'::date, 'DST autumn: +1m clamp'),
  ('2027-10-31'::date, '{"months":2}'::jsonb, '2027-08-31'::date, 'DST autumn: 2m'),
  ('2027-10-30'::date, '{"days":-1}'::jsonb, '2027-10-31'::date, 'DST autumn: day before, +1d'),
  ('2027-11-01'::date, '{"days":1}'::jsonb, '2027-10-31'::date, 'DST autumn: day after, 1d');

select is(private.add_date_offset(v.reference, v."offset"), v.expected, v.note)
from vectors v;

select is(private.add_date_offset(null, '{"months": 1}'), null, 'null reference gives null');
select is(private.add_date_offset(date '2027-08-31', null), null, 'null offset gives null');
select is(private.add_date_offset(date '2027-08-31', '{}'::jsonb), date '2027-08-31', 'empty offset keeps the date');

select * from finish();
rollback;
