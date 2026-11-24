-- FEAT-2026-001 / T9 - DB budget and notifications (plan §3, §3.1, §6, §7).
--
-- Budget: versioned total (append-only), categories (soft delete, only when empty: P5),
-- items and payments. All amounts are integer cents: 0 <= x <= 100.000.000.000 (1 billion euro).
-- Notifications: per-user preferences and `notification_log`, the idempotency/quota ledger of the
-- daily job. The `job_*` functions are executable by the secret key only.
--
-- Conventions inherited from T2: business errors raise P0001 with a stable code as message,
-- authorization failures 42501, immutability 23000; every function revokes EXECUTE from
-- public/anon/authenticated before an explicit grant; SECURITY DEFINER sets search_path.
--
-- NOT here (owned by T8): `tasks.reminders_enabled` (AC61, per-task reminder switch). The job
-- (T16) reads it from `tasks`; this migration only provides the per-user switches and the ledger.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

-- Append-only history of the budget total (AC33). Current total = latest row. No UPDATE/DELETE,
-- not even for the secret key (trigger). `created_by` is stamped by the trigger, never by the client.
create table public.budget_versions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  total_cents bigint not null check (total_cents between 0 and 100000000000),
  reason text check (char_length(reason) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, wedding_id)
);
create index budget_versions_wedding_idx on public.budget_versions (wedding_id, created_at desc, id desc);

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Stable key of a predefined category (src/content/budget-categories.ts); null for custom ones.
  -- Lets the client seed the 11 defaults idempotently.
  default_key text check (default_key ~ '^[a-z0-9-]{1,40}$'),
  -- null = "non assegnato" (D37)
  assigned_cents bigint check (assigned_cents between 0 and 100000000000),
  sort_order integer not null default 0,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (id, wedding_id)
);
create unique index budget_categories_default_key on public.budget_categories (wedding_id, default_key)
  where default_key is not null;
create index budget_categories_wedding_idx on public.budget_categories (wedding_id, sort_order);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  category_id uuid not null,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  status text not null default 'planned' check (status in ('planned', 'agreed', 'cancelled')),
  planned_cents bigint not null default 0 check (planned_cents between 0 and 100000000000),
  -- set when the price is fixed (AC35)
  agreed_cents bigint check (agreed_cents between 0 and 100000000000),
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (id, wedding_id),
  foreign key (category_id, wedding_id) references public.budget_categories (id, wedding_id)
);
create index budget_items_category_idx on public.budget_items (category_id) where deleted_at is null;
create index budget_items_wedding_idx on public.budget_items (wedding_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id),
  item_id uuid not null,
  kind text not null default 'other' check (kind in ('deposit', 'balance', 'other')),
  amount_cents bigint not null check (amount_cents between 0 and 100000000000),
  due_date date,
  paid boolean not null default false,
  paid_on date,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (paid or paid_on is null),
  unique (id, wedding_id),
  foreign key (item_id, wedding_id) references public.budget_items (id, wedding_id)
);
create index payments_item_idx on public.payments (item_id);
create index payments_due_idx on public.payments (wedding_id, due_date) where deleted_at is null and not paid;

-- Per-user switches (AC52). No row = both on (default). Own rows only.
create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  wedding_id uuid not null references public.weddings (id),
  reminders_enabled boolean not null default true,
  digest_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, wedding_id)
);

-- Ledger of the daily job: one row per email batch. `batch_key` is the idempotency key (also the
-- provider Idempotency-Key): `reminder:<user>:<yyyy-mm-dd>` / `digest:<user>:<iso-week>` by convention
-- of the job. No grant at all for API roles: only job_* (secret key) touch it.
--   status: claimed (being sent) -> sent | failed ; skipped_quota (cap reached, may be re-evaluated)
--   item_keys: opaque keys of what the batch covers (e.g. `task_7d:<task>:<due>`) for dedupe.
create table public.notification_log (
  id bigint generated always as identity primary key,
  wedding_id uuid not null references public.weddings (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'digest')),
  batch_key text not null unique check (char_length(batch_key) between 1 and 200),
  item_keys text[] not null default '{}' check (cardinality(item_keys) <= 200),
  status text not null check (status in ('claimed', 'sent', 'failed', 'skipped_quota')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text check (char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  check ((status = 'skipped_quota') = (claimed_at is null)),
  check ((status = 'sent') = (sent_at is not null))
);
create index notification_log_user_idx on public.notification_log (user_id, created_at desc);
create index notification_log_claim_idx on public.notification_log (claimed_at) where status in ('claimed', 'sent');

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

-- budget_versions: stamp the author; never changeable afterwards.
create function private.stamp_budget_version()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger budget_versions_stamp before insert on public.budget_versions
  for each row execute function private.stamp_budget_version();
create trigger budget_versions_forbid_mutation before update or delete on public.budget_versions
  for each row execute function private.forbid_mutation();
create trigger budget_versions_forbid_truncate before truncate on public.budget_versions
  for each statement execute function private.forbid_mutation();

create trigger budget_categories_set_audit_cols before insert on public.budget_categories
  for each row execute function private.set_audit_cols();
create trigger budget_categories_bump_version before update on public.budget_categories
  for each row execute function private.bump_version();
create trigger budget_categories_guard before update on public.budget_categories
  for each row execute function private.guard_row('default_key');

create trigger budget_items_set_audit_cols before insert on public.budget_items
  for each row execute function private.set_audit_cols();
create trigger budget_items_bump_version before update on public.budget_items
  for each row execute function private.bump_version();
create trigger budget_items_guard before update on public.budget_items
  for each row execute function private.guard_row();

create trigger payments_set_audit_cols before insert on public.payments
  for each row execute function private.set_audit_cols();
create trigger payments_bump_version before update on public.payments
  for each row execute function private.bump_version();
create trigger payments_guard before update on public.payments
  for each row execute function private.guard_row('item_id');

create trigger notification_log_guard before update on public.notification_log
  for each row execute function private.guard_row('user_id', 'kind', 'batch_key');

create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function private.touch_updated_at();

-- P5: a category can only be (soft) deleted when it has no live items (AC34, D37). The category row
-- is locked first so a concurrent item insert (which takes a SHARE lock on it) is serialized.
create function private.budget_category_guard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform 1 from public.budget_categories c where c.id = old.id for update;
    if exists (
      select 1 from public.budget_items i
      where i.category_id = old.id and i.wedding_id = old.wedding_id and i.deleted_at is null
    ) then
      raise exception 'category_not_empty' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger budget_categories_guard_delete before update on public.budget_categories
  for each row execute function private.budget_category_guard_delete();

-- P5 (other side): no live item can live in a deleted category (insert, move, restore).
create function private.budget_item_guard_category()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_deleted timestamptz;
begin
  if new.deleted_at is null
     and (tg_op = 'INSERT' or old.deleted_at is not null or new.category_id is distinct from old.category_id) then
    select c.deleted_at into v_deleted from public.budget_categories c
    where c.id = new.category_id and c.wedding_id = new.wedding_id for share;
    if v_deleted is not null then
      raise exception 'category_deleted' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger budget_items_guard_category before insert or update on public.budget_items
  for each row execute function private.budget_item_guard_category();

-- Audit (BR14) for the budget data; preferences and the ledger are not audited (personal / technical).
create trigger budget_versions_audit after insert on public.budget_versions
  for each row execute function private.audit_row();
create trigger budget_categories_audit after insert or update or delete on public.budget_categories
  for each row execute function private.audit_row();
create trigger budget_items_audit after insert or update or delete on public.budget_items
  for each row execute function private.audit_row();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------------------------
-- RLS and grants (matrix §3.1)
-- ---------------------------------------------------------------------------------------------

alter table public.budget_versions enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budget_items enable row level security;
alter table public.payments enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_log enable row level security;

create policy budget_versions_select on public.budget_versions for select to authenticated
  using (public.has_permission(wedding_id, 'budget', 'read'));
create policy budget_versions_insert on public.budget_versions for insert to authenticated
  with check (public.has_permission(wedding_id, 'budget', 'write'));

create policy budget_categories_select on public.budget_categories for select to authenticated
  using (public.has_permission(wedding_id, 'budget', 'read'));
create policy budget_categories_insert on public.budget_categories for insert to authenticated
  with check (public.has_permission(wedding_id, 'budget', 'write'));
create policy budget_categories_update on public.budget_categories for update to authenticated
  using (public.has_permission(wedding_id, 'budget', 'write'))
  with check (public.has_permission(wedding_id, 'budget', 'write'));

create policy budget_items_select on public.budget_items for select to authenticated
  using (public.has_permission(wedding_id, 'budget', 'read'));
create policy budget_items_insert on public.budget_items for insert to authenticated
  with check (public.has_permission(wedding_id, 'budget', 'write'));
create policy budget_items_update on public.budget_items for update to authenticated
  using (public.has_permission(wedding_id, 'budget', 'write'))
  with check (public.has_permission(wedding_id, 'budget', 'write'));

create policy payments_select on public.payments for select to authenticated
  using (public.has_permission(wedding_id, 'budget', 'read'));
create policy payments_insert on public.payments for insert to authenticated
  with check (public.has_permission(wedding_id, 'budget', 'write'));
create policy payments_update on public.payments for update to authenticated
  using (public.has_permission(wedding_id, 'budget', 'write'))
  with check (public.has_permission(wedding_id, 'budget', 'write'));

create policy notification_preferences_select on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'notifications', 'read'));
create policy notification_preferences_insert on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'notifications', 'write'));
create policy notification_preferences_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'notifications', 'write'))
  with check (user_id = (select auth.uid()) and public.has_permission(wedding_id, 'notifications', 'write'));

-- notification_log: RLS on, no policy, no grant.

grant select on public.budget_versions, public.budget_categories, public.budget_items, public.payments,
  public.notification_preferences to authenticated;

grant insert (wedding_id, total_cents, reason) on public.budget_versions to authenticated;

grant insert (wedding_id, name, default_key, assigned_cents, sort_order) on public.budget_categories to authenticated;
grant update (name, assigned_cents, sort_order, deleted_at) on public.budget_categories to authenticated;

grant insert (wedding_id, category_id, description, status, planned_cents, agreed_cents)
  on public.budget_items to authenticated;
-- category_id is NOT updatable: moving goes through move_budget_items (resets Assegnato, D37).
grant update (description, status, planned_cents, agreed_cents, deleted_at) on public.budget_items to authenticated;

grant insert (wedding_id, item_id, kind, amount_cents, due_date, paid, paid_on) on public.payments to authenticated;
grant update (kind, amount_cents, due_date, paid, paid_on, deleted_at) on public.payments to authenticated;

grant insert (user_id, wedding_id, reminders_enabled, digest_enabled) on public.notification_preferences to authenticated;
grant update (reminders_enabled, digest_enabled) on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RPC for authenticated
-- ---------------------------------------------------------------------------------------------

-- move_budget_items(from, to): "Sposta in..." (AC34, D37). Moves every live item of `from` into
-- `to` and returns the source category's Assegnato to "non assegnato". Returns the number moved.
create function public.move_budget_items(p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid;
  v_from public.budget_categories%rowtype;
  v_to public.budget_categories%rowtype;
  v_moved integer;
begin
  if p_from is null or p_to is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  select c.wedding_id into v_wedding from public.budget_categories c where c.id = p_from;
  if v_wedding is null or not public.has_permission(v_wedding, 'budget', 'write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from = p_to then
    raise exception 'same_category' using errcode = 'P0001';
  end if;

  -- Both rows locked in id order (no deadlock between two opposite moves).
  perform 1 from public.budget_categories c
  where c.id in (p_from, p_to) and c.wedding_id = v_wedding order by c.id for update;
  select * into v_from from public.budget_categories c where c.id = p_from;
  select * into v_to from public.budget_categories c where c.id = p_to and c.wedding_id = v_wedding;
  if v_to.id is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  if v_from.deleted_at is not null or v_to.deleted_at is not null then
    raise exception 'category_deleted' using errcode = 'P0001';
  end if;

  update public.budget_items set category_id = p_to
  where category_id = p_from and wedding_id = v_wedding and deleted_at is null;
  get diagnostics v_moved = row_count;

  if v_moved > 0 then
    update public.budget_categories set assigned_cents = null where id = p_from;
  end if;
  return v_moved;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- job_* : secret key only (daily reminders job, plan §7)
-- ---------------------------------------------------------------------------------------------

-- job_recipients(): every partner who MAY get emails: only members (for B this means after the first
-- login, D44) with their switches (no row = on). The job still decides what to send.
create function public.job_recipients()
returns table (
  wedding_id uuid, user_id uuid, partner_slot text, email text,
  first_name text, label text, reminders_enabled boolean, digest_enabled boolean
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select m.wedding_id, m.user_id, m.partner_slot, lower(btrim(u.email)),
         wp.first_name, wp.label,
         coalesce(np.reminders_enabled, true), coalesce(np.digest_enabled, true)
  from public.memberships m
  join auth.users u on u.id = m.user_id and u.deleted_at is null and u.email is not null
  join private.role_permissions rp on rp.role = m.role and rp.area = 'notifications' and rp.action = 'read'
  left join public.wedding_partners wp on wp.wedding_id = m.wedding_id and wp.user_id = m.user_id
  left join public.notification_preferences np on np.user_id = m.user_id and np.wedding_id = m.wedding_id
  where m.role = 'partner'
  order by m.wedding_id, m.partner_slot;
$$;

-- job_claim_notification: atomically claims a batch for (user, kind, batch_key).
-- Result `status`:
--   claimed      new claim: send it, then job_mark_notification_sent
--   resumed      a previous claim expired (15 min) or failed (< 5 attempts): send with the SAME batch_key
--   in_progress  somebody else holds a fresh claim: do nothing
--   already_sent already delivered: do nothing
--   skipped_quota daily/monthly cap reached (`reason`: daily|monthly): not sent, re-evaluated later
--   opted_out    the user switched this email kind off (AC52): nothing claimed
--   failed_final too many failed attempts
-- Caps count claimed+sent rows per UTC day/month. A global advisory lock makes the check exact.
create function public.job_claim_notification(
  p_user_id uuid,
  p_wedding_id uuid,
  p_kind text,
  p_batch_key text,
  p_item_keys text[] default '{}',
  p_daily_cap integer default 50,
  p_monthly_cap integer default 1500,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row public.notification_log%rowtype;
  v_enabled boolean;
  v_day_start timestamptz := date_trunc('day', p_now at time zone 'utc') at time zone 'utc';
  v_month_start timestamptz := date_trunc('month', p_now at time zone 'utc') at time zone 'utc';
  v_today integer;
  v_month integer;
  v_reason text;
  v_id bigint;
begin
  if p_kind not in ('reminder', 'digest') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if p_batch_key is null or char_length(p_batch_key) not between 1 and 200
     or p_daily_cap is null or p_daily_cap < 0 or p_monthly_cap is null or p_monthly_cap < 0 then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;
  -- Only members get emails (B only after the first login, D44).
  if not exists (
    select 1 from public.memberships m
    where m.user_id = p_user_id and m.wedding_id = p_wedding_id and m.role = 'partner'
  ) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('job_claim_notification', 0));

  select case when p_kind = 'reminder' then coalesce(np.reminders_enabled, true)
              else coalesce(np.digest_enabled, true) end
  into v_enabled
  from (select 1) d
  left join public.notification_preferences np on np.user_id = p_user_id and np.wedding_id = p_wedding_id;
  if not v_enabled then
    return jsonb_build_object('status', 'opted_out');
  end if;

  select * into v_row from public.notification_log l where l.batch_key = p_batch_key for update;
  if found then
    if v_row.user_id <> p_user_id or v_row.kind <> p_kind or v_row.wedding_id <> p_wedding_id then
      raise exception 'batch_key_conflict' using errcode = 'P0001';
    end if;
    if v_row.status = 'sent' then
      return jsonb_build_object('status', 'already_sent', 'id', v_row.id);
    elsif v_row.status = 'claimed' then
      if v_row.claimed_at > p_now - interval '15 minutes' then
        return jsonb_build_object('status', 'in_progress', 'id', v_row.id);
      end if;
      update public.notification_log set claimed_at = p_now, attempts = attempts + 1
      where id = v_row.id;
      return jsonb_build_object('status', 'resumed', 'id', v_row.id, 'batch_key', p_batch_key);
    elsif v_row.status = 'failed' then
      if v_row.attempts >= 5 then
        return jsonb_build_object('status', 'failed_final', 'id', v_row.id);
      end if;
      update public.notification_log
      set status = 'claimed', claimed_at = p_now, attempts = attempts + 1, last_error = null
      where id = v_row.id;
      return jsonb_build_object('status', 'resumed', 'id', v_row.id, 'batch_key', p_batch_key);
    end if;
    -- skipped_quota: fall through and re-evaluate the caps.
  end if;

  select count(*) filter (where l.claimed_at >= v_day_start), count(*)
  into v_today, v_month
  from public.notification_log l
  where l.status in ('claimed', 'sent') and l.claimed_at >= v_month_start;

  v_reason := case when v_today >= p_daily_cap then 'daily'
                   when v_month >= p_monthly_cap then 'monthly' end;
  if v_reason is not null then
    if v_row.id is null then
      insert into public.notification_log (wedding_id, user_id, kind, batch_key, item_keys, status, created_at)
      values (p_wedding_id, p_user_id, p_kind, p_batch_key, coalesce(p_item_keys, '{}'), 'skipped_quota', p_now)
      returning id into v_id;
    else
      v_id := v_row.id;
    end if;
    return jsonb_build_object('status', 'skipped_quota', 'id', v_id, 'reason', v_reason);
  end if;

  if v_row.id is null then
    insert into public.notification_log
      (wedding_id, user_id, kind, batch_key, item_keys, status, attempts, claimed_at, created_at)
    values (p_wedding_id, p_user_id, p_kind, p_batch_key, coalesce(p_item_keys, '{}'), 'claimed', 1, p_now, p_now)
    returning id into v_id;
  else
    update public.notification_log
    set status = 'claimed', attempts = attempts + 1, claimed_at = p_now,
        item_keys = coalesce(p_item_keys, item_keys)
    where id = v_row.id returning id into v_id;
  end if;
  return jsonb_build_object('status', 'claimed', 'id', v_id, 'batch_key', p_batch_key);
end;
$$;

-- job_mark_notification_sent(id): claimed -> sent (idempotent when already sent).
create function public.job_mark_notification_sent(p_id bigint, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_status text;
begin
  select l.status into v_status from public.notification_log l where l.id = p_id for update;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_status = 'sent' then
    return 'sent';
  end if;
  if v_status <> 'claimed' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  update public.notification_log set status = 'sent', sent_at = p_now, last_error = null where id = p_id;
  return 'sent';
end;
$$;

-- job_fail_notification(id, error): claimed -> failed (retried with the same batch_key). Never
-- downgrades a sent row. The error text must not contain secrets or addresses.
create function public.job_fail_notification(p_id bigint, p_error text default null)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_status text;
begin
  select l.status into v_status from public.notification_log l where l.id = p_id for update;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_status = 'claimed' then
    update public.notification_log set status = 'failed', last_error = left(p_error, 200) where id = p_id;
    return 'failed';
  end if;
  return v_status;
end;
$$;

-- job_sent_item_keys(user, since): item_keys already claimed/sent for that user since a moment, so
-- the planner never reminds the same item twice.
create function public.job_sent_item_keys(p_user_id uuid, p_since timestamptz)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(array_agg(distinct k), '{}'::text[])
  from public.notification_log l, lateral unnest(l.item_keys) as k
  where l.user_id = p_user_id and l.status in ('claimed', 'sent') and l.claimed_at >= p_since;
$$;

-- job_quota_status(now): counters for the heartbeat and the over-quota flag (AC53).
create function public.job_quota_status(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with b as (
    select date_trunc('day', p_now at time zone 'utc') at time zone 'utc' as day_start,
           date_trunc('month', p_now at time zone 'utc') at time zone 'utc' as month_start
  )
  select jsonb_build_object(
    'sent_today', count(*) filter (where l.status in ('claimed', 'sent') and l.claimed_at >= b.day_start),
    'sent_month', count(*) filter (where l.status in ('claimed', 'sent') and l.claimed_at >= b.month_start),
    'skipped_today', count(*) filter (where l.status = 'skipped_quota' and l.created_at >= b.day_start),
    'skipped_month', count(*) filter (where l.status = 'skipped_quota' and l.created_at >= b.month_start)
  )
  from b left join public.notification_log l on true;
$$;

-- job_unsubscribe(user, kind): one-click unsubscribe (AC52), idempotent. kind: reminders|digest.
create function public.job_unsubscribe(p_user_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wedding uuid;
begin
  if p_kind not in ('reminders', 'digest') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  select m.wedding_id into v_wedding from public.memberships m
  where m.user_id = p_user_id order by m.created_at, m.wedding_id limit 1;
  if v_wedding is null then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  insert into public.notification_preferences (user_id, wedding_id, reminders_enabled, digest_enabled)
  values (p_user_id, v_wedding, p_kind <> 'reminders', p_kind <> 'digest')
  on conflict (user_id, wedding_id) do update set
    reminders_enabled = notification_preferences.reminders_enabled and p_kind <> 'reminders',
    digest_enabled = notification_preferences.digest_enabled and p_kind <> 'digest';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- EXECUTE: revoke from everybody first, then grant explicitly.
-- ---------------------------------------------------------------------------------------------

revoke all on function
  public.move_budget_items(uuid, uuid),
  public.job_recipients(),
  public.job_claim_notification(uuid, uuid, text, text, text[], integer, integer, timestamptz),
  public.job_mark_notification_sent(bigint, timestamptz),
  public.job_fail_notification(bigint, text),
  public.job_sent_item_keys(uuid, timestamptz),
  public.job_quota_status(timestamptz),
  public.job_unsubscribe(uuid, text),
  private.stamp_budget_version(),
  private.touch_updated_at(),
  private.budget_category_guard_delete(),
  private.budget_item_guard_category()
from public, anon, authenticated;

grant execute on function public.move_budget_items(uuid, uuid) to authenticated;

grant execute on function
  public.job_recipients(),
  public.job_claim_notification(uuid, uuid, text, text, text[], integer, integer, timestamptz),
  public.job_mark_notification_sent(bigint, timestamptz),
  public.job_fail_notification(bigint, text),
  public.job_sent_item_keys(uuid, timestamptz),
  public.job_quota_status(timestamptz),
  public.job_unsubscribe(uuid, text)
to service_role;
