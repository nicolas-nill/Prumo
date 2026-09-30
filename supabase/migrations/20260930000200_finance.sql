-- PRUMO · 0200 · Financial model: categories, accounts, cards, recurrences, transactions,
-- monthly planning and goals.
--
-- Composite foreign keys (space_id, x_id) → x(space_id, id) guarantee that a transaction can
-- only reference a category/account/card/member of the SAME space, independently of RLS.

-- ─── Category groups (planning groups: Necessidades, Viver, Investimentos, …) ──
create table public.category_groups (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  key text check (key in ('essentials', 'lifestyle', 'savings')),
  name text not null check (char_length(name) between 1 and 40),
  tone text not null default 'slate' check (tone in ('blue', 'rose', 'lilac', 'sage', 'sand', 'slate')),
  is_savings boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, id),
  unique (space_id, key)
);

comment on column public.category_groups.is_savings is
  'Expenses in savings groups are aportes (investimentos/reserva), not consumption.';

create trigger category_groups_updated_at before update on public.category_groups
  for each row execute function public.set_updated_at();

-- ─── Categories ───────────────────────────────────────────────────────────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  group_id uuid,
  -- Stable catalog key (e.g. 'groceries'); survives renames, used by interpreters. NULL for custom.
  system_key text check (system_key is null or system_key ~ '^[a-z_]{2,40}$'),
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  icon text check (icon is null or char_length(icon) <= 40),
  tone text check (tone is null or tone in ('blue', 'rose', 'lilac', 'sage', 'sand', 'slate')),
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, id),
  foreign key (space_id, group_id) references public.category_groups (space_id, id),
  constraint categories_income_without_group check (kind = 'expense' or group_id is null)
);

create unique index categories_unique_active_name
  on public.categories (space_id, kind, lower(name))
  where is_active;

create unique index categories_unique_system_key
  on public.categories (space_id, system_key)
  where system_key is not null;

create index categories_group_idx on public.categories (group_id);

create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ─── Accounts (no bank connection yet) ────────────────────────────────────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('checking', 'savings', 'wallet', 'cash', 'other')),
  opening_balance_cents bigint not null default 0 check (abs(opening_balance_cents) <= 99999999999),
  owner_id uuid,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, id),
  foreign key (space_id, owner_id) references public.financial_space_members (space_id, user_id)
);

comment on column public.accounts.owner_id is 'NULL = shared account (conta conjunta).';

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- ─── Cards (safe metadata only: never PAN, CVV or credentials) ────────────────
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  limit_cents bigint check (limit_cents is null or (limit_cents > 0 and limit_cents <= 99999999999)),
  holder_id uuid,
  tone text not null default 'slate' check (tone in ('blue', 'rose', 'lilac', 'sage', 'sand', 'slate')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, id),
  foreign key (space_id, holder_id) references public.financial_space_members (space_id, user_id)
);

create trigger cards_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- ─── Recurring rules ──────────────────────────────────────────────────────────
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  description text not null check (char_length(description) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 99999999999),
  category_id uuid,
  account_id uuid,
  card_id uuid,
  member_id uuid not null,
  scope text not null default 'shared' check (scope in ('personal', 'shared')),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  interval smallint not null default 1 check (interval between 1 and 12),
  start_on date not null,
  next_occurrence_on date not null,
  end_on date,
  is_active boolean not null default true,
  auto_post boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, id),
  foreign key (space_id, category_id) references public.categories (space_id, id),
  foreign key (space_id, account_id) references public.accounts (space_id, id),
  foreign key (space_id, card_id) references public.cards (space_id, id),
  foreign key (space_id, member_id) references public.financial_space_members (space_id, user_id),
  constraint recurring_rules_end_after_start check (end_on is null or end_on >= start_on),
  constraint recurring_rules_card_only_expense check (card_id is null or type = 'expense')
);

create index recurring_rules_due_idx on public.recurring_rules (next_occurrence_on) where is_active;
create index recurring_rules_space_idx on public.recurring_rules (space_id);

create trigger recurring_rules_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();

-- ─── Transactions ─────────────────────────────────────────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  status text not null default 'confirmed' check (status in ('confirmed', 'pending')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 99999999999),
  occurred_on date not null,
  description text not null check (char_length(description) between 1 and 140),
  merchant text check (merchant is null or char_length(merchant) <= 80),
  notes text check (notes is null or char_length(notes) <= 500),
  category_id uuid,
  account_id uuid,
  card_id uuid,
  transfer_account_id uuid,
  -- Responsible member: who paid (expense) or received (income).
  member_id uuid not null,
  created_by uuid not null references public.profiles (id),
  scope text not null default 'shared' check (scope in ('personal', 'shared')),
  visibility text not null default 'space' check (visibility in ('space', 'private')),
  source text not null default 'dashboard'
    check (source in ('dashboard', 'whatsapp_text', 'whatsapp_audio', 'whatsapp_image', 'import', 'recurring', 'open_finance')),
  -- External reference for idempotency (WhatsApp message id, import row hash, Open Finance id).
  source_ref text check (source_ref is null or char_length(source_ref) <= 200),
  installment_group_id uuid,
  installment_number smallint,
  installment_count smallint,
  installment_total_cents bigint,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  recurring_occurrence_on date,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (space_id, category_id) references public.categories (space_id, id),
  foreign key (space_id, account_id) references public.accounts (space_id, id),
  foreign key (space_id, card_id) references public.cards (space_id, id),
  foreign key (space_id, transfer_account_id) references public.accounts (space_id, id),
  foreign key (space_id, member_id) references public.financial_space_members (space_id, user_id),
  constraint transactions_private_only_personal check (scope = 'personal' or visibility = 'space'),
  constraint transactions_installments_consistent check (
    (installment_group_id is null and installment_number is null and installment_count is null and installment_total_cents is null)
    or (
      installment_group_id is not null
      and installment_count between 2 and 72
      and installment_number between 1 and installment_count
      and installment_total_cents >= amount_cents
    )
  ),
  constraint transactions_transfer_accounts check (type <> 'transfer' or (account_id is not null and transfer_account_id is not null)),
  constraint transactions_card_only_expense check (card_id is null or type = 'expense'),
  constraint transactions_recurring_pair check (recurring_rule_id is null or recurring_occurrence_on is not null)
);

comment on column public.transactions.visibility is
  'private = visible only to the responsible member and the creator (personal scope only).';

-- Idempotency: one external reference produces each installment at most once.
create unique index transactions_source_ref_unique
  on public.transactions (space_id, source, source_ref, coalesce(installment_number, 0))
  where source_ref is not null;

-- Idempotency for recurrence generation (kept even after soft delete so it is never re-posted).
create unique index transactions_recurring_occurrence_unique
  on public.transactions (recurring_rule_id, recurring_occurrence_on)
  where recurring_rule_id is not null;

create index transactions_space_date_idx
  on public.transactions (space_id, occurred_on desc, created_at desc)
  where deleted_at is null;
create index transactions_space_category_date_idx
  on public.transactions (space_id, category_id, occurred_on)
  where deleted_at is null;
create index transactions_space_member_date_idx
  on public.transactions (space_id, member_id, occurred_on)
  where deleted_at is null;
create index transactions_card_date_idx
  on public.transactions (card_id, occurred_on)
  where card_id is not null and deleted_at is null;
create index transactions_installment_group_idx
  on public.transactions (installment_group_id)
  where installment_group_id is not null;
create index transactions_space_source_idx
  on public.transactions (space_id, source, created_at desc);

create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Immutable ownership columns: a row can never be moved to another space or re-attributed.
create or replace function public.protect_transaction_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.space_id <> old.space_id or new.created_by <> old.created_by or new.source <> old.source then
    raise exception 'space_id, created_by and source are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger transactions_protect_columns before update on public.transactions
  for each row execute function public.protect_transaction_columns();

-- ─── Monthly planning ─────────────────────────────────────────────────────────
create table public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  expected_income_cents bigint not null default 0 check (expected_income_cents between 0 and 99999999999),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, month),
  unique (space_id, id)
);

create trigger monthly_plans_updated_at before update on public.monthly_plans
  for each row execute function public.set_updated_at();

create table public.plan_group_budgets (
  plan_id uuid not null,
  space_id uuid not null,
  group_id uuid not null,
  mode text not null check (mode in ('percent', 'amount')),
  percent_bp integer check (percent_bp is null or percent_bp between 0 and 10000),
  amount_cents bigint check (amount_cents is null or amount_cents between 0 and 99999999999),
  primary key (plan_id, group_id),
  foreign key (space_id, plan_id) references public.monthly_plans (space_id, id) on delete cascade,
  foreign key (space_id, group_id) references public.category_groups (space_id, id) on delete cascade,
  constraint plan_group_budgets_mode_value check (
    (mode = 'percent' and percent_bp is not null) or (mode = 'amount' and amount_cents is not null)
  )
);

create table public.plan_category_budgets (
  plan_id uuid not null,
  space_id uuid not null,
  category_id uuid not null,
  amount_cents bigint not null check (amount_cents between 0 and 99999999999),
  primary key (plan_id, category_id),
  foreign key (space_id, plan_id) references public.monthly_plans (space_id, id) on delete cascade,
  foreign key (space_id, category_id) references public.categories (space_id, id) on delete cascade
);

-- ─── Goals ────────────────────────────────────────────────────────────────────
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  target_amount_cents bigint not null check (target_amount_cents > 0 and target_amount_cents <= 99999999999),
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  scope text not null default 'shared' check (scope in ('personal', 'shared')),
  owner_id uuid,
  tone text not null default 'sage' check (tone in ('blue', 'rose', 'lilac', 'sage', 'sand', 'slate')),
  created_by uuid not null references public.profiles (id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, id),
  foreign key (space_id, owner_id) references public.financial_space_members (space_id, user_id)
);

create index goals_space_idx on public.goals (space_id, status);

create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  space_id uuid not null,
  -- Positive = aporte, negative = retirada.
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 99999999999),
  contributed_on date not null,
  note text check (note is null or char_length(note) <= 140),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (space_id, goal_id) references public.goals (space_id, id) on delete cascade
);

create index goal_contributions_goal_idx on public.goal_contributions (goal_id, contributed_on desc);

-- Goals with their computed balance. security_invoker → RLS of the caller applies.
create view public.goals_with_progress
with (security_invoker = true)
as
select
  g.*,
  coalesce((select sum(c.amount_cents) from public.goal_contributions c where c.goal_id = g.id), 0)::bigint
    as current_amount_cents
from public.goals g;
