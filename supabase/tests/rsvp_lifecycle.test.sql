-- FEAT-2026-004 / T1: lifecycle matrix of the RSVP links (QA-3), table-driven like qa_catalog_matrix.
-- One row = one fresh wedding (group G with A, B, C(infant); group H with D; loose person L), a setup
-- that creates and shares links through the REAL couple RPCs, ONE action, and the expected state:
--   `<label>=<people the link covers now, or ->` for every existing link, then `R:<"Da rimandare" people>`.
-- "Works" = the link covers somebody = the public page would answer (T2 reads the same function), so
-- "-" means the neutral page. Labels: g/h = group link, a/l = personal link of A/L. All data is FAKE.
-- Rows cover BR1-BR5, P2, P6, AC5, AC7, AC9, AC12.
begin;
select plan(80);

create temp sequence lc_seq;
create temp table lc_w (wedding uuid primary key, founder uuid not null);

create function pg_temp.lc_th(p_w uuid, p_label text) returns bytea language sql as
  $$ select extensions.digest(p_w::text || ':' || p_label, 'sha256') $$;
create function pg_temp.lc_gid(p_w uuid, p_name text) returns uuid language sql as
  $$ select id from public.guests where wedding_id = p_w and first_name = p_name $$;
create function pg_temp.lc_grp(p_w uuid, p_name text) returns uuid language sql as
  $$ select id from public.guest_groups where wedding_id = p_w and name = p_name $$;
create function pg_temp.lc_lid(p_w uuid, p_label text) returns uuid language sql as
  $$ select id from public.rsvp_links where wedding_id = p_w and token_hash = pg_temp.lc_th(p_w, p_label) $$;

-- Runs one statement as the partner of the wedding (real RLS and RPC checks), then drops back to the owner.
create function pg_temp.lc_fnd(p_w uuid, p_sql text) returns text language plpgsql as $$
declare
  v_f uuid;
  v_out text;
begin
  select founder into v_f from lc_w where wedding = p_w;
  perform tests.login(v_f);
  execute p_sql into v_out;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v_out;
end;
$$;

create function pg_temp.lc_new(p_mode text) returns uuid language plpgsql as $$
declare
  v_f uuid;
  v_w uuid;
begin
  select m.founder, m.wedding into v_f, v_w from tests.make_wedding('lc' || nextval('lc_seq')) m;
  insert into lc_w values (v_w, v_f);
  insert into public.guest_groups (wedding_id, name, rsvp_mode) values (v_w, 'G', p_mode), (v_w, 'H', 'together');
  insert into public.guests (wedding_id, first_name, category, group_id) values
    (v_w, 'A', 'adult', pg_temp.lc_grp(v_w, 'G')), (v_w, 'B', 'adult', pg_temp.lc_grp(v_w, 'G')),
    (v_w, 'C', 'infant', pg_temp.lc_grp(v_w, 'G')), (v_w, 'D', 'adult', pg_temp.lc_grp(v_w, 'H')),
    (v_w, 'L', 'adult', null);
  return v_w;
end;
$$;

-- Create a link through rsvp_create_links (only a current recipient gets one), optionally "Condiviso".
create function pg_temp.lc_mk(p_w uuid, p_label text, p_kind text, p_name text, p_share boolean default false)
returns void language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
  v_item jsonb;
begin
  v_item := jsonb_build_object('link_id', v_id, 'token_hash', '\x' || encode(pg_temp.lc_th(p_w, p_label), 'hex'),
    case p_kind when 'group' then 'group_id' else 'guest_id' end,
    case p_kind when 'group' then pg_temp.lc_grp(p_w, p_name) else pg_temp.lc_gid(p_w, p_name) end);
  if (pg_temp.lc_fnd(p_w, format('select public.rsvp_create_links(%L::jsonb)', jsonb_build_array(v_item)))::jsonb -> 'created') <> jsonb_build_array(v_id) then
    raise exception 'fixture: the link % was not created', p_label;
  end if;
  if p_share then
    perform pg_temp.lc_share(p_w, p_label);
  end if;
end;
$$;
create function pg_temp.lc_share(p_w uuid, p_label text) returns void language plpgsql as $$
begin
  perform pg_temp.lc_fnd(p_w, format('select public.rsvp_mark_shared(%L)', pg_temp.lc_lid(p_w, p_label)));
end;
$$;
create function pg_temp.lc_revoke(p_w uuid, p_label text) returns void language plpgsql as $$
begin
  perform pg_temp.lc_fnd(p_w, format('select public.rsvp_revoke_link(%L)', pg_temp.lc_lid(p_w, p_label)));
end;
$$;
create function pg_temp.lc_rotate(p_w uuid, p_old text, p_new text) returns void language plpgsql as $$
begin
  perform pg_temp.lc_fnd(p_w, format('select public.rsvp_rotate_link(%L, %L, %L::bytea)',
    pg_temp.lc_lid(p_w, p_old), gen_random_uuid(), '\x' || encode(pg_temp.lc_th(p_w, p_new), 'hex')));
end;
$$;
create function pg_temp.lc_imp(p_w uuid, p_rows text, p_undo boolean default false) returns void language plpgsql as $$
declare
  v_batch text;
begin
  v_batch := pg_temp.lc_fnd(p_w, format('select public.import_guests(%L::jsonb) ->> %L', p_rows, 'batch_id'));
  if p_undo then
    perform pg_temp.lc_fnd(p_w, format('select public.undo_guest_import(%L::uuid)', v_batch));
  end if;
end;
$$;
-- Chooses the date through the real RPCs, then moves the scenario to the wanted day (open decision only).
create function pg_temp.lc_set_date(p_w uuid, p_date date) returns void language plpgsql as $$
declare
  v_dd uuid;
  v_oa uuid;
  v_status text;
begin
  if not exists (select 1 from public.decisions where wedding_id = p_w and key = 'date') then
    perform pg_temp.lc_fnd(p_w, format($q$select public.complete_onboarding(%L::jsonb, %L::jsonb)$q$,
      jsonb_build_array(jsonb_build_object('kind', 'fixed', 'date_from', (private.rome_today() + 200)::text, 'label', 'Settembre')),
      jsonb_build_array(jsonb_build_object('template_key', 'scegli-data-e-location', 'template_version', 1,
        'title', 'Scegliere data e location', 'offset', null))));
  end if;
  select d.id, d.status into v_dd, v_status from public.decisions d where d.wedding_id = p_w and d.key = 'date';
  select o.id into v_oa from public.decision_options o where o.decision_id = v_dd and o.deleted_at is null order by o.created_at, o.id limit 1;
  if v_status = 'taken' then
    perform pg_temp.lc_reopen(p_w);
  end if;
  update public.date_scenarios set date_from = p_date where option_id = v_oa;
  perform pg_temp.lc_fnd(p_w, format('select public.choose_option(%L, %L)', v_dd, v_oa));
end;
$$;
create function pg_temp.lc_reopen(p_w uuid) returns void language plpgsql as $$
begin
  perform pg_temp.lc_fnd(p_w, format('select public.reopen_decision(%L, %L)',
    (select d.id from public.decisions d where d.wedding_id = p_w and d.key = 'date'), 'cambio di idea'));
end;
$$;

-- The observation. Also enforces two invariants on EVERY row: a person is covered by at most one link,
-- and rsvp_status() agrees with the cover about which links work.
create function pg_temp.lc_obs(p_w uuid, p_now timestamptz) returns text language plpgsql as $$
declare
  v_links text;
  v_resend text;
  v_status jsonb;
begin
  if exists (select 1 from private.rsvp_cover(p_w, null, p_now) c group by c.guest_id having count(*) > 1) then
    raise exception 'invariant: a person is covered by two links';
  end if;
  -- REV-9 / P2: the public page (rsvp_resolve) and the list (cover) read the same rule, for every link
  if exists (
    select 1 from unnest(array['a1', 'a2', 'g1', 'g2', 'h1', 'l1']) as lb (label)
    join public.rsvp_links l on l.wedding_id = p_w and l.token_hash = pg_temp.lc_th(p_w, lb.label)
    where exists (select 1 from private.rsvp_resolve(pg_temp.lc_th(p_w, lb.label), p_now))
      is distinct from exists (select 1 from private.rsvp_cover(p_w, l.id, p_now))
  ) then
    raise exception 'invariant: rsvp_resolve (the page) disagrees with the cover (the list)';
  end if;
  select string_agg(x.label || '=' || x.ppl, ' ' order by x.label) into v_links
  from (
    select lb.label, coalesce((select string_agg(g.first_name, ',' order by g.first_name)
                               from private.rsvp_cover(p_w, l.id, p_now) c join public.guests g on g.id = c.guest_id), '-') as ppl
    from unnest(array['a1', 'a2', 'g1', 'g2', 'h1', 'l1']) as lb (label)
    join public.rsvp_links l on l.wedding_id = p_w and l.token_hash = pg_temp.lc_th(p_w, lb.label)
  ) x;
  v_status := pg_temp.lc_fnd(p_w, format('select public.rsvp_status(%L)', p_now))::jsonb;
  if exists (
    select 1 from jsonb_array_elements(v_status -> 'links') l
    where (l ->> 'working')::boolean is distinct from exists (select 1 from private.rsvp_cover(p_w, (l ->> 'id')::uuid, p_now))
  ) then
    raise exception 'invariant: rsvp_status disagrees with the cover';
  end if;
  select coalesce(string_agg(g.first_name, ',' order by g.first_name), '-') into v_resend
  from public.guests g where g.id in (select value::uuid from jsonb_array_elements_text(v_status -> 'resend_guest_ids'));
  return coalesce(v_links, '') || ' R:' || v_resend;
end;
$$;

create function pg_temp.lc_run(p_mode text, p_setup text, p_action text, p_now text) returns text language plpgsql as $$
declare
  v_w uuid := pg_temp.lc_new(p_mode);
begin
  if p_setup is not null then execute format(p_setup, v_w); end if;
  if p_action is not null then execute format(p_action, v_w); end if;
  return pg_temp.lc_obs(v_w, p_now::timestamptz);
end;
$$;

create temp table lc_cases (n int primary key, name text not null, mode text not null, setup text, action text, p_now text, expect text not null);

-- Setups. S_G: group link of G, shared. S_P: personal links of A and L, shared. All through the RPCs.
-- (a group in "together" mode owns its link; in "separate" mode every member is a recipient)
insert into lc_cases (n, name, mode, setup, action, p_now, expect) values
-- ===== together, group link g1 (shared) ======================================================
(1, 'together: baseline, covers the whole group, infant included (AC5)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$, null, null, 'g1=A,B,C R:-'),
(2, 'together: A moves to another group: B,C stay, A "Da rimandare" (BR3)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set group_id = pg_temp.lc_grp(%1$L, 'H') where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'g1=B,C R:A'),
(3, 'together: A leaves the group (no group): same', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set group_id = null where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'g1=B,C R:A'),
(4, 'together: L joins the group: covered by the group link, nothing to resend', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set group_id = pg_temp.lc_grp(%1$L, 'G') where id = pg_temp.lc_gid(%1$L, 'L')$a$, null, 'g1=A,B,C,L R:-'),
(5, 'together: A leaves and comes back: covered again', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set group_id = null where id = pg_temp.lc_gid(%1$L, 'A'); update public.guests set group_id = pg_temp.lc_grp(%1$L, 'G') where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'g1=A,B,C R:-'),
(6, 'together: mode -> separate: the group link sleeps, all three "Da rimandare"', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guest_groups set rsvp_mode = 'separate' where id = pg_temp.lc_grp(%1$L, 'G')$a$, null, 'g1=- R:A,B,C'),
(7, 'together: mode -> separate -> together: the dormant link works again (BR4)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guest_groups set rsvp_mode = 'separate' where id = pg_temp.lc_grp(%1$L, 'G'); update public.guest_groups set rsvp_mode = 'together' where id = pg_temp.lc_grp(%1$L, 'G')$a$, null, 'g1=A,B,C R:-'),
(8, 'together: the group is deleted: link sleeps, members become loose recipients without a link', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guest_groups set deleted_at = now() where id = pg_temp.lc_grp(%1$L, 'G')$a$, null, 'g1=- R:A,B,C'),
(9, 'together: group deleted and restored: the link is back (BR4)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guest_groups set deleted_at = now() where id = pg_temp.lc_grp(%1$L, 'G'); update public.guest_groups set deleted_at = null where id = pg_temp.lc_grp(%1$L, 'G')$a$, null, 'g1=A,B,C R:-'),
(10, 'together: A is deleted: not covered, not listed', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set deleted_at = now() where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'g1=B,C R:-'),
(11, 'together: A deleted and restored: covered again', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set deleted_at = now() where id = pg_temp.lc_gid(%1$L, 'A'); update public.guests set deleted_at = null where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'g1=A,B,C R:-'),
(12, 'together: A is deleted for good (BR5): the others stay covered', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set deleted_at = now() where id = pg_temp.lc_gid(%1$L, 'A'); delete from public.guests where first_name = 'A' and wedding_id = %1$L$a$, null, 'g1=B,C R:-'),
(13, 'together: the group is deleted for good (P6): link and snapshot gone, members "Nessun link"', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guest_groups set deleted_at = now() where id = pg_temp.lc_grp(%1$L, 'G'); delete from public.guest_groups where name = 'G' and wedding_id = %1$L$a$, null, ' R:-'),
(14, 'together: link revoked: neutral page, shared people "Da rimandare" (BR3 as written)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$select pg_temp.lc_revoke(%1$L, 'g1')$a$, null, 'g1=- R:A,B,C'),
(15, 'together: "Nuovo link": old dead, new works, nothing to resend (AC7)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$select pg_temp.lc_rotate(%1$L, 'g1', 'g2')$a$, null, 'g1=- g2=A,B,C R:-'),
(16, 'together: revoke, then create a new link: same result', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$select pg_temp.lc_revoke(%1$L, 'g1'); select pg_temp.lc_mk(%1$L, 'g2', 'group', 'G', false)$a$, null, 'g1=- g2=A,B,C R:-'),
(17, 'together: a group without live members: neutral page', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set deleted_at = now() where wedding_id = %1$L and first_name in ('A', 'B', 'C')$a$, null, 'g1=- R:-'),
(18, 'together: import adds E to the group: covered by the group link', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$select pg_temp.lc_imp(%1$L, '[{"first_name":"E","group":"G"}]')$a$, null, 'g1=A,B,C,E R:-'),
(19, 'together: import then "Annulla importazione": back to the three', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$select pg_temp.lc_imp(%1$L, '[{"first_name":"E","group":"G"}]', true)$a$, null, 'g1=A,B,C R:-'),
(20, 'together: a link never shared has no snapshot: A leaving is not "Da rimandare"', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', false)$a$,
  $a$update public.guests set group_id = null where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'g1=B,C R:-'),
(21, 'together: sharing again after A left keeps A "Da rimandare" (the snapshot only grows)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$update public.guests set group_id = null where id = pg_temp.lc_gid(%1$L, 'A'); select pg_temp.lc_share(%1$L, 'g1')$a$, null, 'g1=B,C R:A'),
-- ===== expiry: date + 30 days, Europe/Rome, across both DST changes (BR7, AC12) ===============
(22, 'expiry: date 2027-03-10 (+30 = 04-09, DST starts 03-28): 23:59:59 on the last day works', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$, $a$select pg_temp.lc_set_date(%1$L, date '2027-03-10')$a$,
  '2027-04-09 23:59:59 Europe/Rome', 'g1=A,B,C R:-'),
(23, 'expiry: the next midnight (Rome) is the neutral page', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$, $a$select pg_temp.lc_set_date(%1$L, date '2027-03-10')$a$,
  '2027-04-10 00:00:00 Europe/Rome', 'g1=- R:A,B,C'),
(24, 'expiry: date 2027-10-05 (+30 = 11-04, DST ends 10-31): last second works', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$, $a$select pg_temp.lc_set_date(%1$L, date '2027-10-05')$a$,
  '2027-11-04 23:59:59 Europe/Rome', 'g1=A,B,C R:-'),
(25, 'expiry: the next midnight is neutral', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$, $a$select pg_temp.lc_set_date(%1$L, date '2027-10-05')$a$,
  '2027-11-05 00:00:00 Europe/Rome', 'g1=- R:A,B,C'),
(26, 'expiry: before the date it works too (the link may be created early)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$, $a$select pg_temp.lc_set_date(%1$L, date '2027-03-10')$a$,
  '2027-01-01 12:00:00 Europe/Rome', 'g1=A,B,C R:-'),
(27, 'expiry: no date chosen, never expires (BR7)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$, null, '2040-01-01 12:00:00 Europe/Rome', 'g1=A,B,C R:-'),
(28, 'expiry: date reopened, no expiry any more (BR8)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$select pg_temp.lc_set_date(%1$L, date '2027-03-10'); select pg_temp.lc_reopen(%1$L)$a$, '2030-01-01 12:00:00 Europe/Rome', 'g1=A,B,C R:-'),
(29, 'expiry: control, the same instant with the date taken is expired', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$, $a$select pg_temp.lc_set_date(%1$L, date '2027-03-10')$a$,
  '2027-06-01 12:00:00 Europe/Rome', 'g1=- R:A,B,C'),
(30, 'expiry: the date moves forward, the links work again (AC12, BR4)', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$select pg_temp.lc_set_date(%1$L, date '2027-03-10'); select pg_temp.lc_set_date(%1$L, date '2028-06-10')$a$,
  '2027-06-01 12:00:00 Europe/Rome', 'g1=A,B,C R:-'),
(31, 'expiry: a revoked link stays dead even with the date reopened', 'together',
  $a$select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', true)$a$,
  $a$select pg_temp.lc_revoke(%1$L, 'g1'); select pg_temp.lc_set_date(%1$L, date '2027-03-10'); select pg_temp.lc_reopen(%1$L)$a$, null, 'g1=- R:A,B,C'),
-- ===== separate, personal links a1 (A) and l1 (L), both shared ================================
(32, 'separate: baseline, one link per recipient', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$, null, null, 'a1=A l1=L R:-'),
(33, 'separate: A moves to a "together" group without link: a1 sleeps, A "Da rimandare"', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guests set group_id = pg_temp.lc_grp(%1$L, 'H') where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'a1=- l1=L R:A'),
(34, 'separate: A goes and comes back: the personal link works again (BR4)', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guests set group_id = pg_temp.lc_grp(%1$L, 'H') where id = pg_temp.lc_gid(%1$L, 'A'); update public.guests set group_id = pg_temp.lc_grp(%1$L, 'G') where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'a1=A l1=L R:-'),
(35, 'separate: the group becomes "together": a1 sleeps, A "Da rimandare"', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guest_groups set rsvp_mode = 'together' where id = pg_temp.lc_grp(%1$L, 'G')$a$, null, 'a1=- l1=L R:A'),
(36, 'separate: together and back: a1 works again', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guest_groups set rsvp_mode = 'together' where id = pg_temp.lc_grp(%1$L, 'G'); update public.guest_groups set rsvp_mode = 'separate' where id = pg_temp.lc_grp(%1$L, 'G')$a$, null, 'a1=A l1=L R:-'),
(37, 'separate: L joins a "together" group: l1 sleeps, L "Da rimandare"', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guests set group_id = pg_temp.lc_grp(%1$L, 'H') where id = pg_temp.lc_gid(%1$L, 'L')$a$, null, 'a1=A l1=- R:L'),
(38, 'separate: L joins the separate group: still its own recipient', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guests set group_id = pg_temp.lc_grp(%1$L, 'G') where id = pg_temp.lc_gid(%1$L, 'L')$a$, null, 'a1=A l1=L R:-'),
(39, 'separate: the group is deleted: members are loose recipients, a1 still works', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guest_groups set deleted_at = now() where id = pg_temp.lc_grp(%1$L, 'G')$a$, null, 'a1=A l1=L R:-'),
(40, 'separate: the group is deleted for good: A has no group, a1 still works', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guest_groups set deleted_at = now() where id = pg_temp.lc_grp(%1$L, 'G'); delete from public.guest_groups where name = 'G' and wedding_id = %1$L$a$, null, 'a1=A l1=L R:-'),
(41, 'separate: A is deleted: a1 sleeps, A not listed', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guests set deleted_at = now() where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'a1=- l1=L R:-'),
(42, 'separate: A deleted and restored: a1 works again', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guests set deleted_at = now() where id = pg_temp.lc_gid(%1$L, 'A'); update public.guests set deleted_at = null where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'a1=A l1=L R:-'),
(43, 'separate: A is deleted for good (BR5): a1 is gone with them', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guests set deleted_at = now() where id = pg_temp.lc_gid(%1$L, 'A'); delete from public.guests where first_name = 'A' and wedding_id = %1$L$a$, null, 'l1=L R:-'),
(44, 'separate: a1 revoked: A "Da rimandare"', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$select pg_temp.lc_revoke(%1$L, 'a1')$a$, null, 'a1=- l1=L R:A'),
(45, 'separate: "Nuovo link" on a personal link', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$select pg_temp.lc_rotate(%1$L, 'a1', 'a2')$a$, null, 'a1=- a2=A l1=L R:-'),
(46, 'separate: an import into the separate group adds a recipient without a link, nothing to resend', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$select pg_temp.lc_imp(%1$L, '[{"first_name":"E","group":"G"}]')$a$, null, 'a1=A l1=L R:-'),
(47, 'separate: import then undo: unchanged', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$select pg_temp.lc_imp(%1$L, '[{"first_name":"E","group":"G"}]', true)$a$, null, 'a1=A l1=L R:-'),
(48, 'separate: A leaves the group (no group): still a recipient', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guests set group_id = null where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'a1=A l1=L R:-'),
(49, 'separate -> together + a group link: A is covered by ONE link only (the group link)', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guest_groups set rsvp_mode = 'together' where id = pg_temp.lc_grp(%1$L, 'G'); select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', false)$a$, null, 'a1=- g1=A,B,C l1=L R:-'),
(50, 'separate -> together -> separate: both links exist, only a1 works', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'l1', 'guest', 'L', true)$a$,
  $a$update public.guest_groups set rsvp_mode = 'together' where id = pg_temp.lc_grp(%1$L, 'G'); select pg_temp.lc_mk(%1$L, 'g1', 'group', 'G', false); update public.guest_groups set rsvp_mode = 'separate' where id = pg_temp.lc_grp(%1$L, 'G')$a$, null, 'a1=A g1=- l1=L R:-'),
(51, 'two groups: A, covered by a1, joins group H that has its own link: covered by h1 only', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true); select pg_temp.lc_mk(%1$L, 'h1', 'group', 'H', true)$a$,
  $a$update public.guests set group_id = pg_temp.lc_grp(%1$L, 'H') where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'a1=- h1=A,D R:-'),
(52, 'separate: a personal link never shared: A moving away is not "Da rimandare"', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', false)$a$,
  $a$update public.guests set group_id = pg_temp.lc_grp(%1$L, 'H') where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'a1=- R:-'),
(53, 'separate: personal link revoked and the person deleted: nobody to resend', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true)$a$,
  $a$select pg_temp.lc_revoke(%1$L, 'a1'); update public.guests set deleted_at = now() where id = pg_temp.lc_gid(%1$L, 'A')$a$, null, 'a1=- R:-'),
(54, 'separate: a1 expired with the date, then the date moves: works again', 'separate',
  $a$select pg_temp.lc_mk(%1$L, 'a1', 'guest', 'A', true)$a$,
  $a$select pg_temp.lc_set_date(%1$L, date '2027-03-10'); select pg_temp.lc_set_date(%1$L, date '2029-03-10')$a$, '2027-06-01 12:00:00 Europe/Rome', 'a1=A R:-');

select format($$select is(pg_temp.lc_run(%L, %L, %L, %L), %L, %L)$$, c.mode, c.setup, c.action, c.p_now, c.expect, 'matrix ' || c.n || ' - ' || c.name)
from lc_cases c order by c.n \gexec

-- ===== Outside the table ==================================================================================
-- Isolation between weddings: same names, same group names, same shape: no crossing.
select pg_temp.lc_new('together') as wa \gset
select pg_temp.lc_new('together') as wb \gset
select pg_temp.lc_mk(:'wa'::uuid, 'g1', 'group', 'G', true);
select pg_temp.lc_mk(:'wb'::uuid, 'g1', 'group', 'G', true);
select pg_temp.lc_imp(:'wa'::uuid, '[{"first_name":"E","group":"G"}]');
select is(pg_temp.lc_obs(:'wa'::uuid, null), 'g1=A,B,C,E R:-', 'two weddings with the same names: W-A got the imported person in ITS group');
select is(pg_temp.lc_obs(:'wb'::uuid, null), 'g1=A,B,C R:-', 'and W-B is untouched (no crossing)');
select is((select count(*)::int from private.rsvp_cover(:'wa'::uuid, null, null) c join public.guests g on g.id = c.guest_id where g.wedding_id <> :'wa'::uuid), 0, 'the cover of a wedding never contains people of another');
select is((select count(*)::int from private.rsvp_cover(:'wa'::uuid, pg_temp.lc_lid(:'wb'::uuid, 'g1'), null)), 0, 'asking the cover of a wedding for a link of another wedding gives nothing');
select is((select count(*)::int from private.rsvp_link_people(pg_temp.lc_lid(:'wa'::uuid, 'g1'), null) p where p.wedding_id <> :'wa'::uuid), 0, 'rsvp_link_people: only the own wedding');
select is((select string_agg(p.first_name, ',' order by p.first_name) from private.rsvp_link_people(pg_temp.lc_lid(:'wa'::uuid, 'g1'), null) p), 'A,B,C,E', 'rsvp_link_people returns the live people the link covers');
select pg_temp.lc_revoke(:'wa'::uuid, 'g1');
select is((select count(*)::int from private.rsvp_link_people(pg_temp.lc_lid(:'wa'::uuid, 'g1'), null)), 0, 'rsvp_link_people of a revoked link is empty (the page is neutral)');
select is((select count(*)::int from private.rsvp_link_people(gen_random_uuid(), null)), 0, 'and of an unknown link');
select is((select count(*)::int from private.rsvp_cover(gen_random_uuid(), null, null)), 0, 'the cover of an unknown wedding is empty');

-- "Da condividere": revoke + new link is not shared, and answers are kept.
select pg_temp.lc_new('together') as wc \gset
select pg_temp.lc_mk(:'wc'::uuid, 'g1', 'group', 'G', true);
insert into public.rsvp_responses (id, wedding_id, status) values (pg_temp.lc_gid(:'wc'::uuid, 'A'), :'wc'::uuid, 'yes');
select pg_temp.lc_rotate(:'wc'::uuid, 'g1', 'g2');
select is((select shared_at is null and revoked_at is null from public.rsvp_links where id = pg_temp.lc_lid(:'wc'::uuid, 'g2')), true, 'rotate: the new link is "Da condividere" (active, never shared)');
select is((select revoked_at is not null and shared_at is not null from public.rsvp_links where id = pg_temp.lc_lid(:'wc'::uuid, 'g1')), true, 'and the old one is revoked, keeping its "Condiviso il"');
select is((select count(*)::int from public.rsvp_responses where wedding_id = :'wc'::uuid), 1, 'the answers are kept');
select is((select count(*)::int from public.rsvp_link_people where link_id = pg_temp.lc_lid(:'wc'::uuid, 'g2')), 0, 'the new link has no snapshot until it is shared');

-- rsvp_expires_on and p_now default: real clock.
select pg_temp.lc_new('together') as wd \gset
select is(private.rsvp_expires_on(:'wd'::uuid), null, 'no "date" decision: no expiry');
select pg_temp.lc_mk(:'wd'::uuid, 'g1', 'group', 'G', true);
select pg_temp.lc_set_date(:'wd'::uuid, (private.rome_today() - 31));
select is(private.rsvp_expires_on(:'wd'::uuid), private.rome_today() - 1, 'date + 30 days');
select is(pg_temp.lc_obs(:'wd'::uuid, null), 'g1=- R:A,B,C', 'p_now null = the real clock: expired since yesterday');
select pg_temp.lc_set_date(:'wd'::uuid, (private.rome_today() - 30));
select is(private.rsvp_expires_on(:'wd'::uuid), private.rome_today(), 'date + 30 = today');
select is(pg_temp.lc_obs(:'wd'::uuid, null), 'g1=A,B,C R:-', 'the last day still works with the real clock');
select pg_temp.lc_reopen(:'wd'::uuid);
select is(private.rsvp_expires_on(:'wd'::uuid), null, 'date reopened: no expiry');
-- AC12 defence in depth (REV-8): after the expiry the couple RPCs refuse; mark_shared follows p_now.
create function pg_temp.lc_items(p_w uuid, p_label text, p_kind text, p_name text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('link_id', gen_random_uuid(), 'token_hash', '\x' || encode(pg_temp.lc_th(p_w, p_label), 'hex'),
    case p_kind when 'group' then 'group_id' else 'guest_id' end,
    case p_kind when 'group' then pg_temp.lc_grp(p_w, p_name) else pg_temp.lc_gid(p_w, p_name) end)) $$;
select pg_temp.lc_new('together') as we \gset
select pg_temp.lc_mk(:'we'::uuid, 'g1', 'group', 'G', true);
select pg_temp.lc_set_date(:'we'::uuid, date '2027-03-10');
select format('select public.rsvp_create_links(%L::jsonb, %L::timestamptz)', pg_temp.lc_items(:'we'::uuid, 'l1', 'guest', 'L')::text, '2027-04-10 00:00:00 Europe/Rome') as sql_ce \gset
select format('select public.rsvp_create_links(%L::jsonb, %L::timestamptz)', pg_temp.lc_items(:'we'::uuid, 'l1', 'guest', 'L')::text, '2027-04-09 23:59:59 Europe/Rome') as sql_co \gset
select throws_ok(format($$select pg_temp.lc_fnd(%L, %L)$$, :'we', :'sql_ce'), 'P0001', 'link_expired', 'create_links after the expiry: link_expired');
select is(jsonb_array_length(pg_temp.lc_fnd(:'we'::uuid, :'sql_co')::jsonb -> 'created'), 1, 'create_links on the last valid day works');
select format('select public.rsvp_rotate_link(%L, %L, %L::bytea, %L::timestamptz)', pg_temp.lc_lid(:'we'::uuid, 'g1'), gen_random_uuid(),
  '\x' || encode(pg_temp.lc_th(:'we'::uuid, 'g2'), 'hex'), '2027-04-10 00:00:00 Europe/Rome') as sql_re \gset
select throws_ok(format($$select pg_temp.lc_fnd(%L, %L)$$, :'we', :'sql_re'), 'P0001', 'link_expired', 'rotate after the expiry: link_expired');
select is((select revoked_at is null from public.rsvp_links where id = pg_temp.lc_lid(:'we'::uuid, 'g1')), true, 'and the link was not revoked');
select format('select public.rsvp_mark_shared(%L, %L::timestamptz)', pg_temp.lc_lid(:'we'::uuid, 'l1'), '2027-04-10 00:00:00 Europe/Rome') as sql_me \gset
select throws_ok(format($$select pg_temp.lc_fnd(%L, %L)$$, :'we', :'sql_me'), 'P0001', 'link_not_working', 'mark_shared evaluates "works" with p_now: an expired link cannot be marked');
select is(pg_temp.lc_fnd(:'we'::uuid, format('select public.rsvp_mark_shared(%L, %L::timestamptz)', pg_temp.lc_lid(:'we'::uuid, 'l1'), '2027-04-09 23:59:59 Europe/Rome'))::jsonb -> 'previous' ->> 'shared_at', null, 'and the same call before the expiry works');
select is((select count(*)::int from lc_cases), 54, 'the matrix has 54 rows (adding one changes the plan on purpose)');

select * from finish();
rollback;
