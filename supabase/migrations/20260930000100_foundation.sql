-- PRUMO · 0100 · Foundation: profiles, plans, financial spaces, membership, invitations.
--
-- Conventions
--   * Money: bigint cents. Never numeric/float for amounts.
--   * Dates: `date` for calendar facts (occurred_on), `timestamptz` for events.
--   * Enumerations: text + CHECK (easy to evolve, e.g. adding Open Finance sources).
--   * Every financial row belongs to a financial_space; users reach data only through membership.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Plans (entitlements catalog; prices intentionally absent) ────────────────
create table public.plans (
  code text primary key check (code in ('free', 'premium')),
  name text not null,
  max_members integer not null check (max_members >= 1),
  ai_actions_per_month integer not null check (ai_actions_per_month >= 0),
  history_months integer check (history_months is null or history_months > 0),
  max_recurring_rules integer check (max_recurring_rules is null or max_recurring_rules >= 0),
  created_at timestamptz not null default now()
);

comment on table public.plans is 'Provisional plan limits (early access). Mirrors src/domain/entitlements.ts.';

insert into public.plans (code, name, max_members, ai_actions_per_month, history_months, max_recurring_rules)
values
  ('free', 'Free', 2, 150, 12, 15),
  ('premium', 'Premium', 2, 3000, null, null);

-- ─── Profiles ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) between 1 and 120),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  timezone text not null default 'America/Sao_Paulo',
  currency char(3) not null default 'BRL',
  locale text not null default 'pt-BR',
  default_space_id uuid,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── Financial spaces ─────────────────────────────────────────────────────────
create table public.financial_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('personal', 'shared')),
  currency char(3) not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  plan_code text not null default 'free' references public.plans (code),
  owner_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.financial_spaces is
  'The financial unit (a person, a couple, later a family). All financial data hangs from here.';

create index financial_spaces_owner_idx on public.financial_spaces (owner_id);

create trigger financial_spaces_updated_at before update on public.financial_spaces
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_default_space_fk
  foreign key (default_space_id) references public.financial_spaces (id) on delete set null;

-- ─── Membership ───────────────────────────────────────────────────────────────
create table public.financial_space_members (
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (space_id, user_id)
);

create unique index financial_space_members_one_owner
  on public.financial_space_members (space_id)
  where role = 'owner' and status = 'active';

create index financial_space_members_user_idx
  on public.financial_space_members (user_id)
  where status = 'active';

-- ─── Invitations ──────────────────────────────────────────────────────────────
create table public.space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'member' check (role in ('admin', 'member')),
  -- Only the SHA-256 of the token is stored; the raw token exists in the invite link alone.
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create unique index space_invitations_one_pending_per_email
  on public.space_invitations (space_id, email)
  where status = 'pending';

create index space_invitations_space_idx on public.space_invitations (space_id, created_at desc);

-- ─── New auth user → profile ──────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
