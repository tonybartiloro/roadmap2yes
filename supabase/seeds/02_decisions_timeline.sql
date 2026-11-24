-- FEAT-2026-001 / T8 seed: FAKE data only (the repository is public). Local and CI only.
-- Builds on the demo wedding of 01_core.sql: two date scenarios (one fixed, one period), two
-- location candidates (one linked to a date), reactions and a few Percorso tasks.
-- Idempotent: it does nothing when the demo wedding already has decisions.

do $$
declare
  v_wedding uuid := '00000000-0000-4000-8000-0000000000e1';
  v_a uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b uuid := '00000000-0000-4000-8000-0000000000b1';
  v_date uuid;
  v_loc uuid;
  v_d1 uuid;
  v_d2 uuid;
  v_l1 uuid;
  v_l2 uuid;
begin
  if not exists (select 1 from public.weddings where id = v_wedding)
     or exists (select 1 from public.decisions where wedding_id = v_wedding) then
    return;
  end if;

  perform private.ensure_decisions(v_wedding);
  select id into v_date from public.decisions where wedding_id = v_wedding and key = 'date';
  select id into v_loc from public.decisions where wedding_id = v_wedding and key = 'location';

  insert into public.decision_options (decision_id, wedding_id, title, comune, notes, pros, cons, cost_cents)
  values (v_loc, v_wedding, 'Villa Demo', 'Demoville', 'Location finta per i test.',
          array['Giardino ampio'], array['Lontana dalla stazione'], 800000)
  returning id into v_l1;
  insert into public.decision_options (decision_id, wedding_id, title, comune, link, pros, cons)
  values (v_loc, v_wedding, 'Agriturismo Prova', 'Provaterra', 'https://example.test/agriturismo',
          array['Prezzo contenuto'], array['Pochi posti letto'])
  returning id into v_l2;

  insert into public.decision_options (decision_id, wedding_id, title)
  values (v_date, v_wedding, '3 settembre 2027') returning id into v_d1;
  insert into public.date_scenarios (option_id, wedding_id, kind, date_from, location_option_id)
  values (v_d1, v_wedding, 'fixed', date '2027-09-03', v_l1);

  insert into public.decision_options (decision_id, wedding_id, title)
  values (v_date, v_wedding, 'Maggio-giugno 2028') returning id into v_d2;
  insert into public.date_scenarios (option_id, wedding_id, kind, date_from, date_to)
  values (v_d2, v_wedding, 'period', date '2028-05-01', date '2028-06-30');

  insert into public.option_reactions (option_id, wedding_id, user_id, reaction) values
    (v_l1, v_wedding, v_a, 'prefer'), (v_l1, v_wedding, v_b, 'doubt');

  perform private.insert_tasks_core(v_wedding, jsonb_build_array(
    jsonb_build_object('template_key', 'scegli-data-e-location', 'template_version', 1,
      'title', 'Scegliere data e location', 'category', 'location', 'offset', null),
    jsonb_build_object('template_key', 'scegli-catering', 'template_version', 1,
      'title', 'Scegliere il catering', 'category', 'catering', 'offset', jsonb_build_object('months', 9)),
    jsonb_build_object('template_key', 'save-the-date', 'template_version', 1,
      'title', 'Inviare i save the date', 'category', 'partecipazioni', 'offset', jsonb_build_object('months', 8)),
    jsonb_build_object('template_key', 'ordina-partecipazioni', 'template_version', 1,
      'title', 'Ordinare le partecipazioni', 'category', 'partecipazioni',
      'offset', jsonb_build_object('months', 4, 'weeks', 2))
  ));
  insert into public.tasks (wedding_id, title, notes, assignee)
  values (v_wedding, 'Chiedere un preventivo alla fiorista', 'Compito finto aggiunto a mano.', 'A');

  update public.weddings set rite = 'civile', onboarding_completed_at = now() where id = v_wedding;
end;
$$;
