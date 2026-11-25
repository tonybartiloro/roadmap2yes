-- FEAT-2026-003 / T1 seed: FAKE guests for the demo wedding of 01_core.sql. The repository is PUBLIC:
-- invented names only, emails ONLY @example.test, phones ONLY the fictional pattern `+39 000 000 NNNN`
-- (tests/unit/guests-seed.test.ts enforces both). Local and CI only. Idempotent (fixed ids).

do $$
declare
  v_wedding uuid := '00000000-0000-4000-8000-0000000000e1';
begin
  if not exists (select 1 from public.weddings where id = v_wedding) then
    return;
  end if;

  insert into public.guest_groups (id, wedding_id, name) values
    ('00000000-0000-4000-8000-0000000a0001', v_wedding, 'Famiglia Esempio'),
    ('00000000-0000-4000-8000-0000000a0002', v_wedding, 'Amici dell''universita'' (finti)'),
    ('00000000-0000-4000-8000-0000000a0003', v_wedding, 'Gruppo eliminato')
  on conflict (id) do nothing;

  insert into public.guest_tables (id, wedding_id, name, capacity, shape) values
    ('00000000-0000-4000-8000-0000000a1001', v_wedding, 'Tavolo 1', 8, 'round'),
    ('00000000-0000-4000-8000-0000000a1002', v_wedding, 'Tavolo 2', 10, 'rect')
  on conflict (id) do nothing;

  insert into public.guests (id, wedding_id, first_name, last_name, category, side, phone, email, notes, group_id, table_id) values
    ('00000000-0000-4000-8000-0000000a2001', v_wedding, 'Mario', 'Esempio', 'adult', 'A', '+39 000 000 0001', 'mario.esempio@example.test', null,
      '00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000a1001'),
    ('00000000-0000-4000-8000-0000000a2002', v_wedding, 'Lucia', 'Esempio', 'adult', 'A', '+39 000 000 0002', 'lucia.esempio@example.test', 'Vegetariana (finta)',
      '00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000a1001'),
    ('00000000-0000-4000-8000-0000000a2003', v_wedding, 'Giulia', 'Esempio', 'child', 'A', null, null, null,
      '00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000a1001'),
    ('00000000-0000-4000-8000-0000000a2004', v_wedding, 'Tommaso', 'Esempio', 'infant', 'A', null, null, null,
      '00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000a1001'),
    ('00000000-0000-4000-8000-0000000a2005', v_wedding, 'Anna', 'Prova', 'adult', 'B', '+39 000 000 0005', 'anna.prova@example.test', null,
      '00000000-0000-4000-8000-0000000a0002', null),
    ('00000000-0000-4000-8000-0000000a2006', v_wedding, 'Paolo', 'Prova', 'adult', 'both', null, 'paolo.prova@example.test', null,
      '00000000-0000-4000-8000-0000000a0002', null),
    ('00000000-0000-4000-8000-0000000a2007', v_wedding, 'Sara', 'Finta', 'adult', null, '+39 000 000 0007', null, null,
      null, null),
    ('00000000-0000-4000-8000-0000000a2008', v_wedding, 'Luca', 'Inventato', 'adult', 'B', null, null, null,
      '00000000-0000-4000-8000-0000000a0003', null),
    ('00000000-0000-4000-8000-0000000a2009', v_wedding, 'Elena', 'Cancellata', 'adult', 'A', null, null, null,
      null, null)
  on conflict (id) do nothing;

  -- "Eliminati di recente": a deleted group (it keeps its member, who shows as "Senza gruppo") and a deleted guest.
  update public.guest_groups set deleted_at = now()
  where id = '00000000-0000-4000-8000-0000000a0003' and deleted_at is null;
  update public.guests set deleted_at = now()
  where id = '00000000-0000-4000-8000-0000000a2009' and deleted_at is null;
end;
$$;
