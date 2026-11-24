-- pgTAP helpers shared by core_*.test.sql (and available to T8/T9/QA files).
-- Installed in schema `tests` OUTSIDE a transaction so later files can use them. Local/CI only.
-- Usage inside a test (always `reset role;` before switching identity):
--   reset role; select tests.login(tests.make_user('x@example.test', true, 'sposo'));
-- All emails are FAKE (@example.test).
create schema if not exists tests;

create or replace function tests.make_user(
  p_email text, p_founder boolean default false, p_role text default null
) returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('unused-test-code-1', extensions.gen_salt('bf')), now(),
    jsonb_strip_nulls(jsonb_build_object('provider', 'email', 'r2y_founder', case when p_founder then true end, 'r2y_role', p_role)),
    '{}', now(), now()
  );
  return v_id;
end;
$$;

-- Acts as an authenticated user (claims as PostgREST would set them).
create or replace function tests.login(p_user uuid) returns void language plpgsql as $$
declare
  v_email text;
  v_meta jsonb;
begin
  select email, raw_app_meta_data into v_email, v_meta from auth.users where id = p_user;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'email', v_email, 'app_metadata', v_meta)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

create or replace function tests.login_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- A wedding created through the real RPC: returns (founder, wedding). Leaves the role reset.
create or replace function tests.make_wedding(p_prefix text) returns table (founder uuid, wedding uuid)
language plpgsql as $$
begin
  founder := tests.make_user(p_prefix || '.a@example.test', true, 'sposo');
  perform tests.login(founder);
  wedding := public.create_wedding();
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return next;
end;
$$;

select plan(1);
select ok(true, 'pgTAP helpers installed');
select * from finish();
