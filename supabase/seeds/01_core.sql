-- FEAT-2026-001 / T2 seed: FAKE data only (the repository is public). Local and CI only:
-- `supabase db push` never runs seeds. Emails are @example.test (scripts/check-test-emails.ts).
-- One demo wedding with both partners already inside. Access code of both demo users:
-- 'demo-seed-code-2027' (fake, local stack only).
-- RUNBOOK (REV-8): these accounts have a KNOWN code. Never run `supabase db reset --linked`
-- (it would seed staging/production); remote environments only get `db push`, which never seeds.

do $$
declare
  v_a uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b uuid := '00000000-0000-4000-8000-0000000000b1';
  v_wedding uuid := '00000000-0000-4000-8000-0000000000e1';
  v_code text := 'demo-seed-code-2027';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
     'demo.a@example.test', extensions.crypt(v_code, extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"],"r2y_founder":true,"r2y_role":"sposo"}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
     'demo.b@example.test', extensions.crypt(v_code, extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text, 'email',
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
  from auth.users u where u.id in (v_a, v_b)
    and not exists (select 1 from auth.identities i where i.user_id = u.id);

  insert into public.weddings (id, rite, theme_id, created_by)
  values (v_wedding, 'civile', 'giardino', v_a) on conflict (id) do nothing;
  insert into public.wedding_partners (wedding_id, slot, label, first_name, last_name, email, user_id) values
    (v_wedding, 'A', 'sposo', 'Anna', 'Demo', 'demo.a@example.test', v_a),
    (v_wedding, 'B', 'sposa', 'Bruno', 'Prova', 'demo.b@example.test', v_b)
  on conflict do nothing;
  insert into public.memberships (wedding_id, user_id, role, partner_slot) values
    (v_wedding, v_a, 'partner', 'A'), (v_wedding, v_b, 'partner', 'B')
  on conflict do nothing;
end;
$$;
