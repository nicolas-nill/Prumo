-- PRUMO · 0400 · Row Level Security.
--
-- Rule zero: nobody reads or writes a financial space they are not an active member of.
-- Privacy rule: a personal transaction marked `private` is visible only to its responsible
-- member and its creator — the partner does not see it, not even in totals.
-- The service role (server-only: webhooks, cron) bypasses RLS and must scope by space itself.

-- ─── Authorization helpers ────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can consult membership without recursive RLS evaluation.

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.financial_space_members m
    where m.space_id = p_space_id and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function public.space_role(p_space_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.financial_space_members m
  where m.space_id = p_space_id and m.user_id = (select auth.uid()) and m.status = 'active';
$$;

create or replace function public.is_space_admin(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.space_role(p_space_id) in ('owner', 'admin'), false);
$$;

create or replace function public.shares_space_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.financial_space_members a
    join public.financial_space_members b on b.space_id = a.space_id and b.status = 'active'
    where a.user_id = (select auth.uid()) and a.status = 'active' and b.user_id = p_user_id
  );
$$;

create or replace function public.can_view_transaction(p_space_id uuid, p_visibility text, p_member_id uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_space_member(p_space_id)
    and (p_visibility = 'space' or p_member_id = (select auth.uid()) or p_created_by = (select auth.uid()));
$$;

create or replace function public.can_edit_transaction(p_space_id uuid, p_scope text, p_visibility text, p_member_id uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_transaction(p_space_id, p_visibility, p_member_id, p_created_by)
    and (p_scope = 'shared' or p_member_id = (select auth.uid()) or p_created_by = (select auth.uid()));
$$;

revoke execute on function public.is_space_member(uuid), public.space_role(uuid), public.is_space_admin(uuid),
  public.shares_space_with(uuid), public.can_view_transaction(uuid, text, uuid, uuid),
  public.can_edit_transaction(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.is_space_member(uuid), public.space_role(uuid), public.is_space_admin(uuid),
  public.shares_space_with(uuid), public.can_view_transaction(uuid, text, uuid, uuid),
  public.can_edit_transaction(uuid, text, text, uuid, uuid) to authenticated;

-- ─── Enable RLS everywhere ────────────────────────────────────────────────────
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.financial_spaces enable row level security;
alter table public.financial_space_members enable row level security;
alter table public.space_invitations enable row level security;
alter table public.category_groups enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.cards enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.plan_group_budgets enable row level security;
alter table public.plan_category_budgets enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.whatsapp_identities enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_pending_actions enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.audit_log enable row level security;

-- Anonymous visitors never touch application tables directly.
revoke all on all tables in schema public from anon;

-- ─── Plans: public catalog for signed-in users ────────────────────────────────
create policy plans_read on public.plans for select to authenticated using (true);

-- ─── Profiles ─────────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_space_with(id));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ─── Spaces & membership (writes go through SECURITY DEFINER RPCs) ────────────
create policy spaces_select on public.financial_spaces for select to authenticated
  using (public.is_space_member(id));
create policy spaces_update_admin on public.financial_spaces for update to authenticated
  using (public.is_space_admin(id)) with check (public.is_space_admin(id));

-- Plan/owner changes are not a client concern (billing will run server-side).
revoke update on public.financial_spaces from authenticated;
grant update (name, timezone) on public.financial_spaces to authenticated;

create policy members_select on public.financial_space_members for select to authenticated
  using (public.is_space_member(space_id));

create policy invitations_select on public.space_invitations for select to authenticated
  using (public.is_space_member(space_id));

-- ─── Space-scoped financial tables: members read and write ────────────────────
create policy category_groups_all on public.category_groups for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy categories_all on public.categories for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy accounts_all on public.accounts for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy cards_all on public.cards for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy recurring_rules_select on public.recurring_rules for select to authenticated
  using (public.is_space_member(space_id));
create policy recurring_rules_insert on public.recurring_rules for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = (select auth.uid()));
create policy recurring_rules_update on public.recurring_rules for update to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy recurring_rules_delete on public.recurring_rules for delete to authenticated
  using (public.is_space_member(space_id));
create policy monthly_plans_all on public.monthly_plans for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy plan_group_budgets_all on public.plan_group_budgets for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy plan_category_budgets_all on public.plan_category_budgets for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy goals_all on public.goals for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy goal_contributions_select on public.goal_contributions for select to authenticated
  using (public.is_space_member(space_id));
create policy goal_contributions_insert on public.goal_contributions for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = (select auth.uid()));
create policy goal_contributions_delete on public.goal_contributions for delete to authenticated
  using (public.is_space_member(space_id));

-- ─── Transactions: membership + privacy + edit rights. No hard deletes. ───────
create policy transactions_select on public.transactions for select to authenticated
  using (public.can_view_transaction(space_id, visibility, member_id, created_by));

create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    public.is_space_member(space_id)
    and created_by = (select auth.uid())
    and deleted_at is null
    -- private personal rows must involve the author
    and (visibility = 'space' or member_id = (select auth.uid()) or created_by = (select auth.uid()))
  );

create policy transactions_update on public.transactions for update to authenticated
  using (public.can_edit_transaction(space_id, scope, visibility, member_id, created_by))
  with check (public.can_edit_transaction(space_id, scope, visibility, member_id, created_by));

revoke delete on public.transactions from authenticated;

-- ─── WhatsApp: users see and manage only their own identities ─────────────────
create policy whatsapp_identities_select_own on public.whatsapp_identities for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.whatsapp_identities from authenticated;

create policy whatsapp_messages_select_own on public.whatsapp_messages for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.whatsapp_messages from authenticated;
revoke all on public.whatsapp_pending_actions from authenticated;

-- ─── Metering & audit: read-only for members, written by server/triggers ─────
create policy ai_usage_select on public.ai_usage_events for select to authenticated
  using (user_id = (select auth.uid()) or (space_id is not null and public.is_space_admin(space_id)));
revoke insert, update, delete on public.ai_usage_events from authenticated;

create policy audit_log_select on public.audit_log for select to authenticated
  using (space_id is not null and public.is_space_member(space_id));
revoke insert, update, delete on public.audit_log from authenticated;
