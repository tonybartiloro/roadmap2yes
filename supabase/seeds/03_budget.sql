-- FEAT-2026-001 / T9 seed: FAKE budget for the demo wedding of 01_core.sql (the repository is public).
-- Local and CI only. Amounts are integer cents. Idempotent (fixed ids, on conflict do nothing).

do $$
declare
  v_wedding uuid := '00000000-0000-4000-8000-0000000000e1';
  v_b uuid := '00000000-0000-4000-8000-0000000000b1';
begin
  if not exists (select 1 from public.weddings where id = v_wedding) then
    return;
  end if;

  -- Two versions: the total went from 20.000 to 25.000 euro. Timestamps are stamped by the DB
  -- (clock_timestamp, in insert order), so the second row is the latest.
  insert into public.budget_versions (id, wedding_id, total_cents, reason)
  select '00000000-0000-4000-8000-0000000b0001', v_wedding, 2000000, 'Prima stima'
  where not exists (select 1 from public.budget_versions where id = '00000000-0000-4000-8000-0000000b0001');
  insert into public.budget_versions (id, wedding_id, total_cents, reason)
  select '00000000-0000-4000-8000-0000000b0002', v_wedding, 2500000, 'Aiuto dai genitori'
  where not exists (select 1 from public.budget_versions where id = '00000000-0000-4000-8000-0000000b0002');

  insert into public.budget_categories (id, wedding_id, name, default_key, assigned_cents, sort_order) values
    ('00000000-0000-4000-8000-0000000c0001', v_wedding, 'Location', 'location', 800000, 1),
    ('00000000-0000-4000-8000-0000000c0002', v_wedding, 'Catering', 'catering', 900000, 2),
    ('00000000-0000-4000-8000-0000000c0003', v_wedding, 'Fiori e allestimento', 'fiori-allestimento', null, 6),
    ('00000000-0000-4000-8000-0000000c0004', v_wedding, 'Cose nostre', null, 100000, 12)
  on conflict (id) do nothing;

  insert into public.budget_items (id, wedding_id, category_id, description, status, planned_cents, agreed_cents) values
    ('00000000-0000-4000-8000-0000000d0001', v_wedding, '00000000-0000-4000-8000-0000000c0001', 'Villa Esempio', 'agreed', 750000, 780000),
    ('00000000-0000-4000-8000-0000000d0002', v_wedding, '00000000-0000-4000-8000-0000000c0002', 'Menu di pesce (80 persone)', 'agreed', 850000, 950000),
    ('00000000-0000-4000-8000-0000000d0003', v_wedding, '00000000-0000-4000-8000-0000000c0003', 'Centrotavola', 'planned', 120000, null),
    ('00000000-0000-4000-8000-0000000d0004', v_wedding, '00000000-0000-4000-8000-0000000c0003', 'Arco floreale', 'cancelled', 90000, null)
  on conflict (id) do nothing;

  insert into public.payments (id, wedding_id, item_id, kind, amount_cents, due_date, paid, paid_on) values
    ('00000000-0000-4000-8000-0000000e0001', v_wedding, '00000000-0000-4000-8000-0000000d0001', 'deposit', 200000, '2026-12-15', true, '2026-12-10'),
    ('00000000-0000-4000-8000-0000000e0002', v_wedding, '00000000-0000-4000-8000-0000000d0001', 'balance', 580000, '2027-08-20', false, null),
    ('00000000-0000-4000-8000-0000000e0003', v_wedding, '00000000-0000-4000-8000-0000000d0002', 'deposit', 300000, '2027-03-01', false, null)
  on conflict (id) do nothing;

  -- B switched the weekly digest off; A keeps the defaults (no row).
  insert into public.notification_preferences (user_id, wedding_id, reminders_enabled, digest_enabled)
  values (v_b, v_wedding, true, false)
  on conflict do nothing;
end;
$$;
