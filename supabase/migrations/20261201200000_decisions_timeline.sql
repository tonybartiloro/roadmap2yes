-- FEAT-2026-001 / T8 - Decisions, date scenarios and the Percorso engine in the database
-- (plan §3 "Decisioni, scenari, Percorso", §3.1 write matrix, §5, Gate B: date -> location link).
--
-- Conventions (same as the core migration):
--   * RLS is the only authorization layer; direct writes of `authenticated` are limited by COLUMN
--     grants; everything else goes through SECURITY DEFINER functions that check permission.
--   * Business errors raise P0001 with a stable machine code as message; authorization failures
--     42501; immutable / append-only violations 23000.
--   * Every SECURITY DEFINER function sets search_path; every new function is revoked from
--     public/anon/authenticated and then granted explicitly (allowlist at the end of the file).
--   * Triggers that run as the caller and need privileged lookups are SECURITY DEFINER; the ones
--     that must know WHO is writing (tasks) are not, and look at `current_user`
--     ('authenticated' = direct API write, anything else = trusted code path).
--
-- Reference rule (plan change log 2026-11-24, must match src/domain/timeline/reference.ts):
--   1. decision taken        -> the chosen scenario, "definitive";
--   2. else manual reference -> if still an open (candidate), non deleted scenario, "provisional";
--   3. else earliest candidate scenario whose date is not before today in Europe/Rome; if every one
--      is in the past, the earliest of them; tie-break by id as text.
--   Candidate = `decision_options.status = 'candidate'` (T4 calls it "open").

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

-- Generic decision primitive (AC23): `key` identifies it inside a wedding ('date', 'location'),
-- `type` says what its options look like; new types need no DDL (only code that understands them).
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  type text not null check (type ~ '^[a-z][a-z0-9_]{0,39}$'),
  question text not null check (char_length(question) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'taken')),
  chosen_option_id uuid,
  chosen_at timestamptz,
  chosen_by uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (wedding_id, key),
  unique (id, wedding_id),
  check ((status = 'taken') = (chosen_option_id is not null))
);

create table public.decision_options (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null,
  wedding_id uuid not null references public.weddings (id),
  title text not null check (char_length(title) between 1 and 120),
  comune text check (char_length(comune) <= 80),
  link text check (char_length(link) <= 600 and link ~* '^https?://[^[:space:]]+$'),
  notes text check (char_length(notes) <= 2000),
  pros text[] not null default '{}'
    check (cardinality(pros) <= 20 and char_length(array_to_string(pros, ' ')) <= 2000),
  cons text[] not null default '{}'
    check (cardinality(cons) <= 20 and char_length(array_to_string(cons, ' ')) <= 2000),
  cost_cents bigint check (cost_cents >= 0 and cost_cents <= 100000000000),
  -- Written only by choose_option / reopen_decision (no column grant).
  status text not null default 'candidate' check (status in ('candidate', 'chosen', 'discarded')),
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (id, wedding_id),
  foreign key (decision_id, wedding_id) references public.decisions (id, wedding_id)
);
create index decision_options_decision_idx on public.decision_options (decision_id);

alter table public.decisions
  add constraint decisions_chosen_option_fk
  foreign key (chosen_option_id, wedding_id) references public.decision_options (id, wedding_id);

-- The manual reference scenario (core left the FK to this migration).
alter table public.weddings
  add constraint weddings_manual_reference_fk
  foreign key (manual_reference_option_id, id) references public.decision_options (id, wedding_id);

-- A date candidate: one row per option of a decision of type 'date'. Q7: optionally linked to a
-- location candidate of the same wedding (informative only, BR22).
create table public.date_scenarios (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null,
  wedding_id uuid not null references public.weddings (id),
  kind text not null check (kind in ('fixed', 'period')),
  date_from date not null check (date_from between date '2000-01-01' and date '2100-12-31'),
  date_to date check (date_to between date '2000-01-01' and date '2100-12-31'),
  location_option_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (option_id),
  foreign key (option_id, wedding_id) references public.decision_options (id, wedding_id),
  -- Deleting (hard) a location unlinks the date instead of failing; logical deletion is handled by trigger.
  foreign key (location_option_id, wedding_id) references public.decision_options (id, wedding_id)
    on delete set null (location_option_id),
  check ((kind = 'fixed' and date_to is null) or (kind = 'period' and date_to is not null and date_to >= date_from))
);
create index date_scenarios_location_idx on public.date_scenarios (location_option_id)
  where location_option_id is not null;

-- Append-only history of a decision (AC21). Written only by triggers and RPCs.
create table public.decision_events (
  id bigint generated always as identity primary key,
  decision_id uuid not null,
  wedding_id uuid not null references public.weddings (id),
  kind text not null check (kind in (
    'option_added', 'option_updated', 'option_removed', 'chosen', 'reopened', 'note',
    'reference_set', 'reference_auto'
  )),
  option_id uuid,
  reason text check (char_length(reason) <= 1000),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4000),
  -- Null = system (secret-key job). No FK on purpose: append-only and accounts can be deleted.
  actor_id uuid,
  at timestamptz not null default now(),
  foreign key (decision_id, wedding_id) references public.decisions (id, wedding_id),
  foreign key (option_id, wedding_id) references public.decision_options (id, wedding_id)
);
create index decision_events_decision_idx on public.decision_events (decision_id, at, id);
create index decision_events_wedding_idx on public.decision_events (wedding_id, at desc);

-- Non binding reaction of one partner to an option (AC22). `reaction` is free-form text with a
-- check so R2+ can add values with one migration.
create table public.option_reactions (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null,
  wedding_id uuid not null references public.weddings (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction text not null check (reaction in ('prefer', 'doubt')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (option_id, user_id),
  foreign key (option_id, wedding_id) references public.decision_options (id, wedding_id)
);

-- Percorso tasks. Template tasks are copies of a milestone (BR5): `template_offset` keeps the
-- offset so the database can recalculate due dates without knowing the catalogue.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  title text not null check (char_length(title) between 1 and 200),
  notes text check (char_length(notes) <= 2000),
  advice text check (char_length(advice) <= 400),
  category text check (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(category) <= 40),
  due_date date check (due_date between date '2000-01-01' and date '2100-12-31'),
  status text not null default 'todo' check (status in ('todo', 'done')),
  assignee text not null default 'both' check (assignee in ('both', 'A', 'B')),
  reminders_enabled boolean not null default true,
  source text not null default 'user' check (source in ('template', 'user')),
  template_key text check (char_length(template_key) <= 60 and template_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  template_version integer check (template_version >= 1),
  template_offset jsonb check (
    template_offset is null or (
      jsonb_typeof(template_offset) = 'object'
      and (template_offset - 'months' - 'weeks' - 'days') = '{}'::jsonb
      and coalesce(template_offset ->> 'months', '0') ~ '^-?[0-9]{1,3}$'
      and coalesce(template_offset ->> 'weeks', '0') ~ '^-?[0-9]{1,4}$'
      and coalesce(template_offset ->> 'days', '0') ~ '^-?[0-9]{1,5}$'
    )
  ),
  due_overridden boolean not null default false,
  needs_review boolean not null default false,
  completed_at timestamptz,
  completed_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check ((source = 'template') = (template_key is not null)),
  check (source = 'template' or (template_version is null and template_offset is null)),
  check ((status = 'done') = (completed_at is not null))
);
-- One task per milestone per wedding, deleted ones included: a deleted template task is never
-- regenerated or re-suggested (BR6, AC31).
create unique index tasks_template_unique on public.tasks (wedding_id, template_key)
  where template_key is not null;
create index tasks_wedding_due_idx on public.tasks (wedding_id, due_date);

-- "Ignora" on a suggestion (AC16). Not scoped by rite (T4 SuggestionDismissal).
create table public.task_suggestion_dismissals (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  template_key text not null check (char_length(template_key) <= 60 and template_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null check (kind in ('add', 'remove')),
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid default auth.uid(),
  unique (wedding_id, template_key, kind)
);

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- "Today" as a calendar date in Europe/Rome (plan §1.1, BR2).
create function private.rome_today()
returns date
language sql
stable
set search_path = pg_catalog, pg_temp
as $$ select (now() at time zone 'Europe/Rome')::date; $$;

-- Date arithmetic shared with the TypeScript engine (tests/fixtures/date-offset-vectors.json):
-- months FIRST with end-of-month clamp (interval arithmetic clamps 31 Aug - 2 months = 30 Jun),
-- THEN weeks and days. Positive offsets move BEFORE the reference, negative ones AFTER it.
create function private.add_date_offset(p_reference date, p_offset jsonb)
returns date
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_months integer := coalesce((p_offset ->> 'months')::integer, 0);
  v_weeks integer := coalesce((p_offset ->> 'weeks')::integer, 0);
  v_days integer := coalesce((p_offset ->> 'days')::integer, 0);
begin
  if p_reference is null or p_offset is null then
    return null;
  end if;
  return (p_reference - make_interval(months => v_months))::date - (v_weeks * 7 + v_days);
end;
$$;

-- Transaction-local flag set by RPCs that write several tables on purpose, so that the row
-- triggers do not emit duplicate events or intermediate syncs. Never settable through the API.
create function private.in_rpc()
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$ select coalesce(current_setting('r2y.internal', true), '') = 'on'; $$;

create function private.log_decision_event(
  p_decision uuid, p_wedding uuid, p_kind text, p_option uuid default null,
  p_reason text default null, p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  insert into public.decision_events (decision_id, wedding_id, kind, option_id, reason, payload, actor_id)
  values (p_decision, p_wedding, p_kind, p_option, p_reason, coalesce(p_payload, '{}'::jsonb), auth.uid());
$$;

-- The reference scenario of a wedding (rule at the top of the file). No row = no reference.
create function private.resolve_reference(p_wedding uuid, p_today date)
returns table (option_id uuid, ref_date date, state text, source text)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_opt uuid;
  v_date date;
begin
  select o.id, s.date_from into v_opt, v_date
  from public.decisions d
  join public.decision_options o on o.decision_id = d.id
  join public.date_scenarios s on s.option_id = o.id
  where d.wedding_id = p_wedding and d.key = 'date' and o.status = 'chosen' and o.deleted_at is null
  limit 1;
  if v_opt is not null then
    return query select v_opt, v_date, 'definitive'::text, 'chosen'::text;
    return;
  end if;

  select o.id, s.date_from into v_opt, v_date
  from public.weddings w
  join public.decision_options o on o.id = w.manual_reference_option_id and o.wedding_id = w.id
  join public.decisions d on d.id = o.decision_id
  join public.date_scenarios s on s.option_id = o.id
  where w.id = p_wedding and d.key = 'date' and o.status = 'candidate' and o.deleted_at is null;
  if v_opt is not null then
    return query select v_opt, v_date, 'provisional'::text, 'manual'::text;
    return;
  end if;

  select o.id, s.date_from into v_opt, v_date
  from public.decisions d
  join public.decision_options o on o.decision_id = d.id
  join public.date_scenarios s on s.option_id = o.id
  where d.wedding_id = p_wedding and d.key = 'date' and o.status = 'candidate' and o.deleted_at is null
  order by (s.date_from < p_today), s.date_from, o.id::text
  limit 1;
  if v_opt is not null then
    return query select v_opt, v_date, 'provisional'::text, 'automatic'::text;
  end if;
end;
$$;

-- sync_timeline for one wedding: applies the reference to `applied_reference_date` and recomputes
-- the due date of template tasks with an offset that are todo, not overridden and not deleted
-- (AC28). Returns the reference date. `needs_review` is never touched here.
-- p_emit: write a `reference_auto` event when the AUTOMATIC reference moves from one date to
-- another (never for the very first reference, never when manually set: the RPC logs it itself).
create function private.sync_timeline_for(p_wedding uuid, p_emit boolean default true)
returns date
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old date;
  v_ref record;
  v_new date;
  v_decision uuid;
begin
  select w.applied_reference_date into v_old
  from public.weddings w where w.id = p_wedding for no key update;
  if not found then
    return null;
  end if;

  select * into v_ref from private.resolve_reference(p_wedding, private.rome_today());
  v_new := v_ref.ref_date;

  if v_new is distinct from v_old then
    update public.weddings set applied_reference_date = v_new where id = p_wedding;
  end if;

  update public.tasks t
  set due_date = case when v_new is null then null else private.add_date_offset(v_new, t.template_offset) end
  where t.wedding_id = p_wedding
    and t.template_offset is not null and t.status = 'todo'
    and not t.due_overridden and t.deleted_at is null
    and t.due_date is distinct from
      (case when v_new is null then null else private.add_date_offset(v_new, t.template_offset) end);

  if p_emit and v_old is not null and v_new is not null and v_new <> v_old and v_ref.source = 'automatic' then
    select d.id into v_decision from public.decisions d where d.wedding_id = p_wedding and d.key = 'date';
    perform private.log_decision_event(v_decision, p_wedding, 'reference_auto', v_ref.option_id, null,
      jsonb_build_object('reference_date', v_new, 'previous_reference_date', v_old));
  end if;
  return v_new;
end;
$$;

-- The two standard decisions of a wedding (created when onboarding completes).
create function private.ensure_decisions(p_wedding uuid)
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  insert into public.decisions (wedding_id, key, type, question) values
    (p_wedding, 'date', 'date', 'Qual è la data del matrimonio?'),
    (p_wedding, 'location', 'location', 'Dove ci sposiamo?')
  on conflict (wedding_id, key) do nothing;
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level triggers: versioning, immutability, audit
-- ---------------------------------------------------------------------------------------------

create trigger decisions_set_audit_cols before insert on public.decisions
  for each row execute function private.set_audit_cols();
create trigger decisions_bump_version before update on public.decisions
  for each row execute function private.bump_version();
create trigger decisions_guard before update on public.decisions
  for each row execute function private.guard_row('key', 'type');

create trigger decision_options_set_audit_cols before insert on public.decision_options
  for each row execute function private.set_audit_cols();
create trigger decision_options_bump_version before update on public.decision_options
  for each row execute function private.bump_version();
create trigger decision_options_guard before update on public.decision_options
  for each row execute function private.guard_row('decision_id');

create trigger date_scenarios_set_audit_cols before insert on public.date_scenarios
  for each row execute function private.set_audit_cols();
create trigger date_scenarios_bump_version before update on public.date_scenarios
  for each row execute function private.bump_version();
create trigger date_scenarios_guard before update on public.date_scenarios
  for each row execute function private.guard_row('option_id');

create trigger option_reactions_set_audit_cols before insert on public.option_reactions
  for each row execute function private.set_audit_cols();
create trigger option_reactions_bump_version before update on public.option_reactions
  for each row execute function private.bump_version();
create trigger option_reactions_guard before update on public.option_reactions
  for each row execute function private.guard_row('option_id', 'user_id');

create trigger tasks_set_audit_cols before insert on public.tasks
  for each row execute function private.set_audit_cols();
create trigger tasks_bump_version before update on public.tasks
  for each row execute function private.bump_version();
-- Template fields are immutable (plan §3.1).
create trigger tasks_guard before update on public.tasks
  for each row execute function private.guard_row('source', 'template_key', 'template_version', 'template_offset', 'advice');

create trigger decisions_audit after insert or update or delete on public.decisions
  for each row execute function private.audit_row();
create trigger decision_options_audit after insert or update or delete on public.decision_options
  for each row execute function private.audit_row();
create trigger date_scenarios_audit after insert or update or delete on public.date_scenarios
  for each row execute function private.audit_row();
create trigger option_reactions_audit after insert or update or delete on public.option_reactions
  for each row execute function private.audit_row();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function private.audit_row();
create trigger task_suggestion_dismissals_audit after insert or update or delete on public.task_suggestion_dismissals
  for each row execute function private.audit_row();

-- decision_events: append-only for everybody, secret key included.
create trigger decision_events_forbid_mutation before update or delete on public.decision_events
  for each row execute function private.forbid_mutation();
create trigger decision_events_forbid_truncate before truncate on public.decision_events
  for each statement execute function private.forbid_mutation();

-- ---------------------------------------------------------------------------------------------
-- tasks rules: due_overridden, completed_*, deleted_by (runs as the caller on purpose)
-- ---------------------------------------------------------------------------------------------

create function private.task_rules()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  -- A due date changed through the API is a manual choice: recalculation leaves it alone (AC28).
  -- Changes made by sync_timeline run inside SECURITY DEFINER code (current_user is the owner).
  if new.due_date is distinct from old.due_date and current_user = 'authenticated' then
    new.due_overridden := true;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'done' then
      new.completed_at := now();
      new.completed_by := auth.uid();
      new.needs_review := false;
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
  else
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  end if;

  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if new.deleted_at is not null then
      new.deleted_at := now();
      new.deleted_by := auth.uid();
    else
      new.deleted_by := null;
    end if;
  else
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

create trigger tasks_rules before update on public.tasks
  for each row execute function private.task_rules();

-- ---------------------------------------------------------------------------------------------
-- decision_options triggers
-- ---------------------------------------------------------------------------------------------

create function private.options_before_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_status text;
begin
  if tg_op = 'INSERT' then
    select d.status into v_status
    from public.decisions d where d.id = new.decision_id and d.wedding_id = new.wedding_id;
    -- Candidates exist only while the decision is open.
    if v_status = 'taken' then
      raise exception 'decision_taken' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if new.deleted_at is not null then
      if old.status = 'chosen' then
        raise exception 'option_chosen' using errcode = 'P0001';
      end if;
      new.deleted_at := now();
      new.deleted_by := auth.uid();
    else
      new.deleted_by := null;
    end if;
  else
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

create trigger decision_options_before_write before insert or update on public.decision_options
  for each row execute function private.options_before_write();

create function private.options_after_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_fields text[] := '{}';
  v_type text;
begin
  if tg_op = 'INSERT' then
    perform private.log_decision_event(new.decision_id, new.wedding_id, 'option_added', new.id, null,
      jsonb_build_object('title', new.title));
    return null;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform private.log_decision_event(new.decision_id, new.wedding_id, 'option_removed', new.id, null,
      jsonb_build_object('title', new.title));
    -- A deleted scenario cannot stay the manual reference: back to automatic.
    update public.weddings set manual_reference_option_id = null
    where id = new.wedding_id and manual_reference_option_id = new.id;
    -- A deleted location unlinks the dates that pointed to it (each unlink logs option_updated).
    select d.type into v_type from public.decisions d where d.id = new.decision_id;
    if v_type = 'location' then
      update public.date_scenarios set location_option_id = null
      where wedding_id = new.wedding_id and location_option_id = new.id;
    end if;
    perform private.sync_timeline_for(new.wedding_id);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform private.log_decision_event(new.decision_id, new.wedding_id, 'option_added', new.id, null,
      jsonb_build_object('title', new.title, 'restored', true));
    perform private.sync_timeline_for(new.wedding_id);
  else
    if new.title is distinct from old.title then v_fields := v_fields || 'title'::text; end if;
    if new.comune is distinct from old.comune then v_fields := v_fields || 'comune'::text; end if;
    if new.link is distinct from old.link then v_fields := v_fields || 'link'::text; end if;
    if new.notes is distinct from old.notes then v_fields := v_fields || 'notes'::text; end if;
    if new.pros is distinct from old.pros then v_fields := v_fields || 'pros'::text; end if;
    if new.cons is distinct from old.cons then v_fields := v_fields || 'cons'::text; end if;
    if new.cost_cents is distinct from old.cost_cents then v_fields := v_fields || 'cost_cents'::text; end if;
    if cardinality(v_fields) > 0 then
      perform private.log_decision_event(new.decision_id, new.wedding_id, 'option_updated', new.id, null,
        jsonb_build_object('fields', to_jsonb(v_fields)));
    end if;
  end if;
  return null;
end;
$$;

create trigger decision_options_after_write after insert or update on public.decision_options
  for each row execute function private.options_after_write();

-- ---------------------------------------------------------------------------------------------
-- date_scenarios triggers
-- ---------------------------------------------------------------------------------------------

create function private.scenarios_before_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_type text;
  v_loc_type text;
  v_loc_deleted timestamptz;
begin
  select d.type into v_type
  from public.decision_options o
  join public.decisions d on d.id = o.decision_id
  where o.id = new.option_id and o.wedding_id = new.wedding_id;
  if v_type is distinct from 'date' then
    raise exception 'not_a_date_option' using errcode = 'P0001';
  end if;

  -- Q7: only a `location` option of the same wedding (the composite FK pins the wedding), not deleted.
  if new.location_option_id is not null
     and (tg_op = 'INSERT' or new.location_option_id is distinct from old.location_option_id) then
    select d.type, o.deleted_at into v_loc_type, v_loc_deleted
    from public.decision_options o
    join public.decisions d on d.id = o.decision_id
    where o.id = new.location_option_id and o.wedding_id = new.wedding_id;
    if v_loc_type is distinct from 'location' then
      raise exception 'invalid_location' using errcode = 'P0001';
    end if;
    if v_loc_deleted is not null then
      raise exception 'location_deleted' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger date_scenarios_before_write before insert or update on public.date_scenarios
  for each row execute function private.scenarios_before_write();

create function private.scenarios_after_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_decision uuid;
  v_fields text[] := '{}';
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_dates_changed boolean;
begin
  if tg_op = 'DELETE' then
    if not private.in_rpc() then
      perform private.sync_timeline_for(old.wedding_id);
    end if;
    return null;
  end if;

  if tg_op = 'INSERT' then
    if not private.in_rpc() then
      perform private.sync_timeline_for(new.wedding_id);
    end if;
    return null;
  end if;

  if new.kind is distinct from old.kind then
    v_fields := v_fields || 'kind'::text;
    v_old := v_old || jsonb_build_object('kind', old.kind);
    v_new := v_new || jsonb_build_object('kind', new.kind);
  end if;
  if new.date_from is distinct from old.date_from then
    v_fields := v_fields || 'date_from'::text;
    v_old := v_old || jsonb_build_object('date_from', old.date_from);
    v_new := v_new || jsonb_build_object('date_from', new.date_from);
  end if;
  if new.date_to is distinct from old.date_to then
    v_fields := v_fields || 'date_to'::text;
    v_old := v_old || jsonb_build_object('date_to', old.date_to);
    v_new := v_new || jsonb_build_object('date_to', new.date_to);
  end if;
  if new.location_option_id is distinct from old.location_option_id then
    v_fields := v_fields || 'location_option_id'::text;
    v_old := v_old || jsonb_build_object('location_option_id', old.location_option_id);
    v_new := v_new || jsonb_build_object('location_option_id', new.location_option_id);
  end if;

  if cardinality(v_fields) > 0 and not private.in_rpc() then
    select o.decision_id into v_decision from public.decision_options o where o.id = new.option_id;
    perform private.log_decision_event(v_decision, new.wedding_id, 'option_updated', new.option_id, null,
      jsonb_build_object('fields', to_jsonb(v_fields), 'old', v_old, 'new', v_new));
  end if;

  v_dates_changed := new.date_from is distinct from old.date_from or new.kind is distinct from old.kind;
  if v_dates_changed and not private.in_rpc() then
    perform private.sync_timeline_for(new.wedding_id);
  end if;
  return null;
end;
$$;

create trigger date_scenarios_after_write after insert or update or delete on public.date_scenarios
  for each row execute function private.scenarios_after_write();

-- ---------------------------------------------------------------------------------------------
-- RLS and grants (matrix §3.1)
-- ---------------------------------------------------------------------------------------------

alter table public.decisions enable row level security;
alter table public.decision_options enable row level security;
alter table public.date_scenarios enable row level security;
alter table public.decision_events enable row level security;
alter table public.option_reactions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_suggestion_dismissals enable row level security;

create policy decisions_select on public.decisions for select to authenticated
  using (public.has_permission(wedding_id, 'decisions', 'read'));
create policy decisions_update on public.decisions for update to authenticated
  using (public.has_permission(wedding_id, 'decisions', 'write'))
  with check (public.has_permission(wedding_id, 'decisions', 'write'));

create policy decision_options_select on public.decision_options for select to authenticated
  using (public.has_permission(wedding_id, 'decisions', 'read'));
create policy decision_options_insert on public.decision_options for insert to authenticated
  with check (public.has_permission(wedding_id, 'decisions', 'write'));
create policy decision_options_update on public.decision_options for update to authenticated
  using (public.has_permission(wedding_id, 'decisions', 'write'))
  with check (public.has_permission(wedding_id, 'decisions', 'write'));

create policy date_scenarios_select on public.date_scenarios for select to authenticated
  using (public.has_permission(wedding_id, 'decisions', 'read'));
create policy date_scenarios_insert on public.date_scenarios for insert to authenticated
  with check (public.has_permission(wedding_id, 'decisions', 'write'));
create policy date_scenarios_update on public.date_scenarios for update to authenticated
  using (public.has_permission(wedding_id, 'decisions', 'write'))
  with check (public.has_permission(wedding_id, 'decisions', 'write'));

create policy decision_events_select on public.decision_events for select to authenticated
  using (public.has_permission(wedding_id, 'decisions', 'read'));

-- Reactions: everybody in the wedding sees them, each partner writes only their own.
create policy option_reactions_select on public.option_reactions for select to authenticated
  using (public.has_permission(wedding_id, 'decisions', 'read'));
create policy option_reactions_insert on public.option_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'decisions', 'write'));
create policy option_reactions_update on public.option_reactions for update to authenticated
  using (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'decisions', 'write'))
  with check (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'decisions', 'write'));
create policy option_reactions_delete on public.option_reactions for delete to authenticated
  using (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'decisions', 'write'));

create policy tasks_select on public.tasks for select to authenticated
  using (public.has_permission(wedding_id, 'tasks', 'read'));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (source = 'user' and public.has_permission(wedding_id, 'tasks', 'write'));
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_permission(wedding_id, 'tasks', 'write'))
  with check (public.has_permission(wedding_id, 'tasks', 'write'));

create policy task_suggestion_dismissals_select on public.task_suggestion_dismissals for select to authenticated
  using (public.has_permission(wedding_id, 'tasks', 'read'));
create policy task_suggestion_dismissals_insert on public.task_suggestion_dismissals for insert to authenticated
  with check (public.has_permission(wedding_id, 'tasks', 'write'));

revoke all on public.decisions, public.decision_options, public.date_scenarios, public.decision_events,
  public.option_reactions, public.tasks, public.task_suggestion_dismissals from anon, authenticated;

grant select on public.decisions, public.decision_options, public.date_scenarios, public.decision_events,
  public.option_reactions, public.tasks, public.task_suggestion_dismissals to authenticated;

grant update (question) on public.decisions to authenticated;

grant insert (wedding_id, decision_id, title, comune, link, notes, pros, cons, cost_cents)
  on public.decision_options to authenticated;
grant update (title, comune, link, notes, pros, cons, cost_cents, deleted_at)
  on public.decision_options to authenticated;

grant insert (wedding_id, option_id, kind, date_from, date_to, location_option_id)
  on public.date_scenarios to authenticated;
grant update (kind, date_from, date_to, location_option_id) on public.date_scenarios to authenticated;

grant insert (wedding_id, option_id, user_id, reaction) on public.option_reactions to authenticated;
grant update (reaction) on public.option_reactions to authenticated;
grant delete on public.option_reactions to authenticated;

grant insert (wedding_id, title, notes, category, due_date, assignee, reminders_enabled)
  on public.tasks to authenticated;
grant update (title, notes, category, due_date, assignee, reminders_enabled, status, deleted_at)
  on public.tasks to authenticated;

grant insert (wedding_id, template_key, kind) on public.task_suggestion_dismissals to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RPC: choose / reopen / note
-- ---------------------------------------------------------------------------------------------

-- choose_option(decision, option, expected_version, exact_date) -> jsonb
-- One atomic operation (AC21): option chosen, the other candidates discarded, decision taken, event.
-- For a date decision whose scenario is a period, `exact_date` (inside the period) is mandatory:
-- the scenario becomes a fixed date and the event keeps the original period (AC64, D33).
-- Errors: forbidden(42501) version_conflict already_taken invalid_option scenario_missing
--         exact_date_required exact_date_out_of_period exact_date_not_applicable
create function public.choose_option(
  p_decision_id uuid, p_option_id uuid, p_expected_version integer default null, p_exact_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_dec public.decisions%rowtype;
  v_opt public.decision_options%rowtype;
  v_sc public.date_scenarios%rowtype;
  v_payload jsonb := '{}'::jsonb;
  v_ref date;
  v_version integer;
begin
  select * into v_dec from public.decisions d where d.id = p_decision_id for no key update;
  if not found or not public.has_permission(v_dec.wedding_id, 'decisions', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_expected_version is not null and p_expected_version <> v_dec.version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  if v_dec.status <> 'open' then
    raise exception 'already_taken' using errcode = 'P0001';
  end if;

  select * into v_opt from public.decision_options o
  where o.id = p_option_id and o.decision_id = v_dec.id and o.deleted_at is null and o.status = 'candidate'
  for no key update;
  if not found then
    raise exception 'invalid_option' using errcode = 'P0001';
  end if;

  if v_dec.type = 'date' then
    select * into v_sc from public.date_scenarios s where s.option_id = v_opt.id for no key update;
    if not found then
      raise exception 'scenario_missing' using errcode = 'P0001';
    end if;
    if v_sc.kind = 'period' then
      if p_exact_date is null then
        raise exception 'exact_date_required' using errcode = 'P0001';
      end if;
      if p_exact_date < v_sc.date_from or p_exact_date > v_sc.date_to then
        raise exception 'exact_date_out_of_period' using errcode = 'P0001';
      end if;
      v_payload := jsonb_build_object(
        'exact_date', p_exact_date,
        'period', jsonb_build_object('kind', 'period', 'date_from', v_sc.date_from, 'date_to', v_sc.date_to));
      perform set_config('r2y.internal', 'on', true);
      update public.date_scenarios set kind = 'fixed', date_from = p_exact_date, date_to = null
      where id = v_sc.id;
      perform set_config('r2y.internal', 'off', true);
    else
      if p_exact_date is not null and p_exact_date <> v_sc.date_from then
        raise exception 'exact_date_out_of_period' using errcode = 'P0001';
      end if;
      v_payload := jsonb_build_object('date_from', v_sc.date_from);
    end if;
  elsif p_exact_date is not null then
    raise exception 'exact_date_not_applicable' using errcode = 'P0001';
  end if;

  update public.decision_options
  set status = case when id = v_opt.id then 'chosen' else 'discarded' end
  where decision_id = v_dec.id and deleted_at is null and status = 'candidate';

  update public.decisions
  set status = 'taken', chosen_option_id = v_opt.id, chosen_at = now(), chosen_by = auth.uid()
  where id = v_dec.id
  returning version into v_version;

  if v_dec.type = 'date' then
    -- The chosen scenario is now the (definitive) reference; the manual choice is moot.
    update public.weddings set manual_reference_option_id = null
    where id = v_dec.wedding_id and manual_reference_option_id is not null;
    -- Choosing settles the "Da rivedere" badges (AC20).
    update public.tasks set needs_review = false where wedding_id = v_dec.wedding_id and needs_review;
    v_ref := private.sync_timeline_for(v_dec.wedding_id, false);
    v_payload := v_payload || jsonb_build_object('reference_date', v_ref);
  end if;

  perform private.log_decision_event(v_dec.id, v_dec.wedding_id, 'chosen', v_opt.id, null, v_payload);
  return jsonb_build_object(
    'decision_id', v_dec.id, 'option_id', v_opt.id, 'version', v_version,
    'reference_date', case when v_dec.type = 'date' then v_ref end);
end;
$$;

-- reopen_decision(decision, reason, expected_version) -> jsonb
-- Mandatory reason; the decision is open again, ALL discarded options (and the previously chosen
-- one) are candidates again. For the date decision the previously chosen scenario stays the
-- reference as the MANUAL, provisional one, and the dependent tasks get `needs_review` (AC19, AC20).
-- Errors: forbidden(42501) version_conflict not_taken reason_required reason_too_long
create function public.reopen_decision(p_decision_id uuid, p_reason text, p_expected_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_dec public.decisions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_prev uuid;
  v_ref date;
  v_version integer;
begin
  select * into v_dec from public.decisions d where d.id = p_decision_id for no key update;
  if not found or not public.has_permission(v_dec.wedding_id, 'decisions', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_expected_version is not null and p_expected_version <> v_dec.version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  if v_dec.status <> 'taken' then
    raise exception 'not_taken' using errcode = 'P0001';
  end if;
  if char_length(v_reason) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;

  v_prev := v_dec.chosen_option_id;
  update public.decisions
  set status = 'open', chosen_option_id = null, chosen_at = null, chosen_by = null
  where id = v_dec.id
  returning version into v_version;

  update public.decision_options set status = 'candidate'
  where decision_id = v_dec.id and deleted_at is null and status in ('chosen', 'discarded');

  if v_dec.type = 'date' then
    update public.weddings set manual_reference_option_id = v_prev where id = v_dec.wedding_id;
    update public.tasks set needs_review = true
    where wedding_id = v_dec.wedding_id and template_offset is not null
      and status = 'todo' and deleted_at is null;
    v_ref := private.sync_timeline_for(v_dec.wedding_id, false);
  end if;

  perform private.log_decision_event(v_dec.id, v_dec.wedding_id, 'reopened', v_prev, v_reason,
    case when v_dec.type = 'date' then jsonb_build_object('reference_date', v_ref) else '{}'::jsonb end);
  return jsonb_build_object('decision_id', v_dec.id, 'version', v_version, 'previous_option_id', v_prev,
    'reference_date', case when v_dec.type = 'date' then v_ref end);
end;
$$;

-- add_decision_note(decision, note, option): appended to the history, never editable (AC21).
create function public.add_decision_note(p_decision_id uuid, p_note text, p_option_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_dec public.decisions%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
  v_id bigint;
begin
  select * into v_dec from public.decisions d where d.id = p_decision_id;
  if not found or not public.has_permission(v_dec.wedding_id, 'decisions', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_note) = 0 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  if p_option_id is not null and not exists (
    select 1 from public.decision_options o where o.id = p_option_id and o.decision_id = v_dec.id
  ) then
    raise exception 'invalid_option' using errcode = 'P0001';
  end if;

  insert into public.decision_events (decision_id, wedding_id, kind, option_id, reason, actor_id)
  values (v_dec.id, v_dec.wedding_id, 'note', p_option_id, v_note, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RPC: reference scenario
-- ---------------------------------------------------------------------------------------------

-- set_reference_scenario(option) -> jsonb { option_id, reference_date, status, source }
-- A candidate date scenario becomes the manual (provisional) reference; NULL returns to the
-- automatic one. Allowed only while the date decision is open.
-- Errors: forbidden(42501) no_date_decision decision_taken invalid_option
create function public.set_reference_scenario(p_option_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_dec public.decisions%rowtype;
  v_manual uuid;
  v_ref record;
  v_scenario public.date_scenarios%rowtype;
begin
  if v_wedding is null or not public.has_permission(v_wedding, 'decisions', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select w.manual_reference_option_id into v_manual
  from public.weddings w where w.id = v_wedding for no key update;

  select * into v_dec from public.decisions d where d.wedding_id = v_wedding and d.key = 'date';
  if not found then
    raise exception 'no_date_decision' using errcode = 'P0001';
  end if;
  if v_dec.status = 'taken' then
    raise exception 'decision_taken' using errcode = 'P0001';
  end if;

  if p_option_id is not null then
    select s.* into v_scenario
    from public.decision_options o
    join public.date_scenarios s on s.option_id = o.id
    where o.id = p_option_id and o.decision_id = v_dec.id and o.status = 'candidate' and o.deleted_at is null;
    if not found then
      raise exception 'invalid_option' using errcode = 'P0001';
    end if;
  end if;

  if p_option_id is distinct from v_manual then
    update public.weddings set manual_reference_option_id = p_option_id where id = v_wedding;
    perform private.sync_timeline_for(v_wedding, false);
    select * into v_ref from private.resolve_reference(v_wedding, private.rome_today());
    if p_option_id is not null then
      perform private.log_decision_event(v_dec.id, v_wedding, 'reference_set', p_option_id, null,
        jsonb_build_object('reference_date', v_ref.ref_date, 'kind', v_scenario.kind));
    else
      perform private.log_decision_event(v_dec.id, v_wedding, 'reference_auto', v_ref.option_id, null,
        jsonb_build_object('reference_date', v_ref.ref_date, 'previous_manual_option_id', v_manual));
    end if;
  else
    select * into v_ref from private.resolve_reference(v_wedding, private.rome_today());
  end if;

  return jsonb_build_object(
    'option_id', v_ref.option_id, 'reference_date', v_ref.ref_date,
    'status', v_ref.state, 'source', v_ref.source);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RPC: tasks
-- ---------------------------------------------------------------------------------------------

-- Shared by insert_template_tasks and complete_onboarding. Each element:
--   { template_key, template_version, title, advice?, category?, offset: {months?,weeks?,days?}|null }
-- The due date is computed here from the CURRENT reference (offset null or no reference = no date).
-- A wedding never gets two tasks for the same template key (deleted ones count): skipped.
create function private.insert_tasks_core(p_wedding uuid, p_tasks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ref date;
  v_el jsonb;
  v_offset jsonb;
  v_inserted integer := 0;
  v_skipped text[] := '{}';
  v_key text;
  v_n integer;
begin
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 100 then
    raise exception 'invalid_tasks' using errcode = 'P0001';
  end if;
  select r.ref_date into v_ref from private.resolve_reference(p_wedding, private.rome_today()) r;

  for v_el in select e from jsonb_array_elements(p_tasks) as e loop
    if jsonb_typeof(v_el) <> 'object' or jsonb_typeof(v_el -> 'template_key') is distinct from 'string'
       or jsonb_typeof(v_el -> 'title') is distinct from 'string'
       or jsonb_typeof(v_el -> 'template_version') is distinct from 'number' then
      raise exception 'invalid_task' using errcode = 'P0001';
    end if;
    v_key := v_el ->> 'template_key';
    v_offset := case when jsonb_typeof(v_el -> 'offset') = 'object' then v_el -> 'offset' end;
    begin
      insert into public.tasks (wedding_id, title, advice, category, due_date, source,
                                template_key, template_version, template_offset)
      values (
        p_wedding, v_el ->> 'title', v_el ->> 'advice', v_el ->> 'category',
        private.add_date_offset(v_ref, v_offset), 'template',
        v_key, (v_el ->> 'template_version')::integer, v_offset
      )
      on conflict (wedding_id, template_key) where template_key is not null do nothing;
    exception when check_violation or invalid_text_representation or numeric_value_out_of_range
      or datetime_field_overflow then
      raise exception 'invalid_task' using errcode = 'P0001', detail = v_key;
    end;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped || v_key;
    end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'skipped_keys', to_jsonb(v_skipped), 'reference_date', v_ref);
end;
$$;

-- insert_template_tasks(tasks jsonb) -> { inserted, skipped_keys, reference_date }
-- "Accetta nuova" (AC16, AC48) and the initial Percorso. Errors: forbidden(42501) invalid_tasks invalid_task
create function public.insert_template_tasks(p_tasks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
begin
  if v_wedding is null or not public.has_permission(v_wedding, 'tasks', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.insert_tasks_core(v_wedding, p_tasks);
end;
$$;

-- acknowledge_task_review(task) -> number of tasks cleared. NULL = every task of the wedding.
-- "Va bene così" (AC20). Errors: forbidden(42501)
create function public.acknowledge_task_review(p_task_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_n integer;
begin
  if v_wedding is null or not public.has_permission(v_wedding, 'tasks', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_task_id is not null
     and not exists (select 1 from public.tasks t where t.id = p_task_id and t.wedding_id = v_wedding) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.tasks set needs_review = false
  where wedding_id = v_wedding and needs_review and (p_task_id is null or id = p_task_id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RPC: onboarding
-- ---------------------------------------------------------------------------------------------

-- complete_onboarding(scenarios, tasks) -> jsonb (AC14, AC15). One transaction:
--   * creates the 'date' and 'location' decisions;
--   * creates the date scenarios: [{ kind: 'fixed'|'period', date_from, date_to?, label? }];
--   * inserts the initial Percorso (same element shape as insert_template_tasks);
--   * stamps onboarding_completed_at. A second call is refused.
-- Wedding fields, partners and the invitation are written by their own grants/RPCs; the budget by
-- the budget migration. Errors: forbidden(42501) already_completed invalid_scenarios invalid_scenario
--         + the errors of insert_template_tasks
create function public.complete_onboarding(p_scenarios jsonb default '[]'::jsonb, p_tasks jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid := private.current_wedding_id();
  v_completed timestamptz;
  v_dec uuid;
  v_el jsonb;
  v_kind text;
  v_from date;
  v_to date;
  v_title text;
  v_opt uuid;
  v_count integer := 0;
  v_tasks jsonb;
  v_ref record;
begin
  if v_wedding is null or not public.has_permission(v_wedding, 'wedding', 'write')
     or not public.has_permission(v_wedding, 'decisions', 'write')
     or not public.has_permission(v_wedding, 'tasks', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_scenarios is null or jsonb_typeof(p_scenarios) <> 'array' or jsonb_array_length(p_scenarios) > 10 then
    raise exception 'invalid_scenarios' using errcode = 'P0001';
  end if;

  select w.onboarding_completed_at into v_completed
  from public.weddings w where w.id = v_wedding for update;
  if v_completed is not null then
    raise exception 'already_completed' using errcode = 'P0001';
  end if;

  perform private.ensure_decisions(v_wedding);
  select d.id into v_dec from public.decisions d where d.wedding_id = v_wedding and d.key = 'date';

  -- Triggers skip their intermediate syncs; one sync runs after everything is in place.
  perform set_config('r2y.internal', 'on', true);
  for v_el in select e from jsonb_array_elements(p_scenarios) as e loop
    begin
      if jsonb_typeof(v_el) <> 'object' then
        raise exception 'invalid_scenario' using errcode = 'P0001';
      end if;
      v_kind := v_el ->> 'kind';
      v_from := (v_el ->> 'date_from')::date;
      v_to := (v_el ->> 'date_to')::date;
      v_title := nullif(btrim(coalesce(v_el ->> 'label', '')), '');
      if v_kind not in ('fixed', 'period') or v_from is null then
        raise exception 'invalid_scenario' using errcode = 'P0001';
      end if;
      v_title := coalesce(v_title,
        case when v_kind = 'period'
          then 'Dal ' || to_char(v_from, 'DD/MM/YYYY') || ' al ' || to_char(v_to, 'DD/MM/YYYY')
          else to_char(v_from, 'DD/MM/YYYY') end);
      insert into public.decision_options (decision_id, wedding_id, title)
      values (v_dec, v_wedding, v_title) returning id into v_opt;
      insert into public.date_scenarios (option_id, wedding_id, kind, date_from, date_to)
      values (v_opt, v_wedding, v_kind, v_from, v_to);
    exception when check_violation or invalid_text_representation or datetime_field_overflow
      or string_data_right_truncation or not_null_violation then
      raise exception 'invalid_scenario' using errcode = 'P0001';
    end;
    v_count := v_count + 1;
  end loop;
  perform set_config('r2y.internal', 'off', true);

  perform private.sync_timeline_for(v_wedding, false);
  v_tasks := private.insert_tasks_core(v_wedding, coalesce(p_tasks, '[]'::jsonb));

  update public.weddings set onboarding_completed_at = now() where id = v_wedding;

  select * into v_ref from private.resolve_reference(v_wedding, private.rome_today());
  return jsonb_build_object(
    'wedding_id', v_wedding, 'scenarios', v_count, 'tasks', v_tasks,
    'reference_date', v_ref.ref_date, 'reference_status', v_ref.state);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Secret key: recompute references as time passes (T16 daily job, tests)
-- ---------------------------------------------------------------------------------------------

-- sync_timeline(wedding) -> number of weddings processed. NULL = all. An automatic reference that
-- moves because "today" moved logs a `reference_auto` event with a null actor (system).
create function public.sync_timeline(p_wedding_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in select w.id from public.weddings w where p_wedding_id is null or w.id = p_wedding_id loop
    perform private.sync_timeline_for(r.id, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- EXECUTE allowlist (plan §3.1): revoke first, then grant explicitly
-- ---------------------------------------------------------------------------------------------

revoke all on function
  private.rome_today(),
  private.add_date_offset(date, jsonb),
  private.in_rpc(),
  private.log_decision_event(uuid, uuid, text, uuid, text, jsonb),
  private.resolve_reference(uuid, date),
  private.sync_timeline_for(uuid, boolean),
  private.ensure_decisions(uuid),
  private.task_rules(),
  private.options_before_write(),
  private.options_after_write(),
  private.scenarios_before_write(),
  private.scenarios_after_write(),
  private.insert_tasks_core(uuid, jsonb),
  public.choose_option(uuid, uuid, integer, date),
  public.reopen_decision(uuid, text, integer),
  public.add_decision_note(uuid, text, uuid),
  public.set_reference_scenario(uuid),
  public.insert_template_tasks(jsonb),
  public.acknowledge_task_review(uuid),
  public.complete_onboarding(jsonb, jsonb),
  public.sync_timeline(uuid)
from public, anon, authenticated;

grant execute on function
  public.choose_option(uuid, uuid, integer, date),
  public.reopen_decision(uuid, text, integer),
  public.add_decision_note(uuid, text, uuid),
  public.set_reference_scenario(uuid),
  public.insert_template_tasks(jsonb),
  public.acknowledge_task_review(uuid),
  public.complete_onboarding(jsonb, jsonb)
to authenticated;

-- secret key only
grant execute on function public.sync_timeline(uuid) to service_role;
