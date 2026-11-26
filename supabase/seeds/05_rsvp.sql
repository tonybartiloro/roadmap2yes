-- FEAT-2026-004 / T3 seed: RSVP test case on the FAKE demo wedding of 01_core.sql / 04_guests.sql.
-- The repository is PUBLIC (BR12): fake names only. LOCAL AND CI ONLY: this file must never run on
-- staging or production (supabase/seeds is applied by `supabase db reset` only). Idempotent.
--
-- Cases (people come from 04_guests.sql):
--   * "Famiglia Esempio" (together, the default): ONE link covers its 4 live members.
--   * "Amici dell'universita' (finti)" (separate): each member is a recipient on their own, no link yet.
--   * Sara Finta: no group, a recipient on her own, no link yet.
--
-- Fake local token (ADR-0003: token = base64url(HMAC-SHA256(secret, "r2y-rsvp:v1:" + link id))):
--   RSVP_LINK_SECRET (fake, local/test only) = local-fake-rsvp-secret-0123456789abcdef
--   link id                                  = 00000000-0000-4000-8000-0000000a3001
--   token                                    = D-nIsgqL5dGbgoSIb9_oamFr3fXgA_dVLTkmc1J0vno
--   local URL                                = http://localhost:3000/rsvp/D-nIsgqL5dGbgoSIb9_oamFr3fXgA_dVLTkmc1J0vno
-- The hash below is sha256 of the token string. The e2e seed must NOT use this token (QA-6).

do $$
declare
  v_wedding uuid := '00000000-0000-4000-8000-0000000000e1';
begin
  if not exists (select 1 from public.guest_groups where id = '00000000-0000-4000-8000-0000000a0002') then
    return;
  end if;

  update public.guest_groups set rsvp_mode = 'separate'
  where id = '00000000-0000-4000-8000-0000000a0002' and rsvp_mode <> 'separate';

  insert into public.rsvp_links (id, wedding_id, group_id, token_hash) values
    ('00000000-0000-4000-8000-0000000a3001', v_wedding, '00000000-0000-4000-8000-0000000a0001',
     '\x6519b8d9ff03cd286669dcec27d4d3ecab803042f1867dd4930fa120fdfa32f7')
  on conflict (id) do nothing;
end;
$$;
