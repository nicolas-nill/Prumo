-- PRUMO · 0500 · Functions & RPCs.
--
-- Error convention: application errors raise messages prefixed with PRUMO_<CODE> so the
-- app can map them to typed errors (src/server/supabase/errors.ts).
--
-- SECURITY DEFINER is used only where an operation must cross RLS on purpose (creating a
-- space with its owner membership, accepting an invitation) and each one re-checks
-- auth.uid() and membership explicitly. Aggregations are SECURITY INVOKER: RLS applies,
-- so private transactions of a partner never enter your totals.

-- ─── Default groups & categories (mirror of src/domain/catalog.ts) ────────────
create or replace function public.seed_space_defaults(p_space_id uuid, p_category_keys text[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_essentials uuid;
  v_lifestyle uuid;
  v_savings uuid;
begin
  insert into public.category_groups (space_id, key, name, tone, is_savings, is_system, sort_order)
  values
    (p_space_id, 'essentials', 'Necessidades', 'blue', false, true, 1),
    (p_space_id, 'lifestyle', 'Viver', 'rose', false, true, 2),
    (p_space_id, 'savings', 'Investimentos', 'lilac', true, true, 3)
  on conflict (space_id, key) do nothing;

  select id into v_essentials from public.category_groups where space_id = p_space_id and key = 'essentials';
  select id into v_lifestyle from public.category_groups where space_id = p_space_id and key = 'lifestyle';
  select id into v_savings from public.category_groups where space_id = p_space_id and key = 'savings';

  insert into public.categories (space_id, group_id, system_key, name, kind, icon, is_system, sort_order)
  select
    p_space_id,
    case c.grp when 'essentials' then v_essentials when 'lifestyle' then v_lifestyle when 'savings' then v_savings end,
    c.key, c.name, c.kind, c.icon, true, c.sort_order
  from (
    values
      ('housing', 'Moradia', 'expense', 'essentials', 'home', 1, true, false),
      ('groceries', 'Mercado', 'expense', 'essentials', 'shopping-cart', 2, true, false),
      ('utilities', 'Contas da casa', 'expense', 'essentials', 'plug', 3, true, false),
      ('transport', 'Transporte', 'expense', 'essentials', 'car', 4, true, false),
      ('health', 'Saúde', 'expense', 'essentials', 'heart-pulse', 5, true, false),
      ('education', 'Educação', 'expense', 'essentials', 'graduation-cap', 6, true, false),
      ('kids', 'Filhos', 'expense', 'essentials', 'baby', 7, false, false),
      ('pets', 'Pets', 'expense', 'essentials', 'paw-print', 8, false, false),
      ('restaurants', 'Restaurantes', 'expense', 'lifestyle', 'utensils', 1, true, false),
      ('leisure', 'Lazer', 'expense', 'lifestyle', 'ticket', 2, true, false),
      ('shopping', 'Compras', 'expense', 'lifestyle', 'shopping-bag', 3, true, false),
      ('subscriptions', 'Assinaturas', 'expense', 'lifestyle', 'repeat', 4, true, false),
      ('personal_care', 'Cuidados pessoais', 'expense', 'lifestyle', 'sparkles', 5, true, false),
      ('travel', 'Viagens', 'expense', 'lifestyle', 'plane', 6, true, false),
      ('gifts', 'Presentes', 'expense', 'lifestyle', 'gift', 7, false, false),
      ('investments', 'Investimentos', 'expense', 'savings', 'trending-up', 1, true, true),
      ('emergency_fund', 'Reserva de emergência', 'expense', 'savings', 'shield', 2, true, false),
      ('other', 'Outros', 'expense', null, 'circle-dashed', 99, true, true),
      ('salary', 'Salário', 'income', null, 'briefcase', 1, true, true),
      ('extra_income', 'Renda extra', 'income', null, 'hand-coins', 2, true, true),
      ('yields', 'Rendimentos', 'income', null, 'piggy-bank', 3, true, true),
      ('refunds', 'Reembolsos', 'income', null, 'rotate-ccw', 4, true, true),
      ('other_income', 'Outras receitas', 'income', null, 'plus-circle', 5, true, true)
  ) as c(key, name, kind, grp, icon, sort_order, default_on, required)
  where c.required
     or (p_category_keys is null and c.default_on)
     or c.key = any (coalesce(p_category_keys, '{}'::text[]))
  on conflict do nothing;
end;
$$;

-- ─── Onboarding: profile + space + owner membership + defaults + first plan ───
create or replace function public.complete_onboarding(
  p_full_name text,
  p_space_name text,
  p_space_type text,
  p_expected_income_cents bigint default 0,
  p_plan_mode text default 'preset',
  p_group_percents jsonb default null,
  p_category_keys text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_space_id uuid;
  v_plan_id uuid;
  v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_sum integer;
begin
  if v_uid is null then
    raise exception 'PRUMO_UNAUTHENTICATED' using errcode = '28000';
  end if;
  if p_space_type not in ('personal', 'shared') or p_plan_mode not in ('preset', 'custom', 'skip') then
    raise exception 'PRUMO_INVALID: space type or plan mode' using errcode = '22023';
  end if;
  if p_plan_mode = 'custom' then
    select coalesce(sum(value::int), 0) into v_sum from jsonb_each_text(coalesce(p_group_percents, '{}'::jsonb));
    if v_sum > 10000 then
      raise exception 'PRUMO_INVALID: allocation above 100%%' using errcode = '22023';
    end if;
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    insert into public.profiles (id) values (v_uid) returning * into v_profile;
  end if;

  -- Idempotent: a double submit returns the space created by the first one.
  if v_profile.onboarded_at is not null and v_profile.default_space_id is not null then
    return v_profile.default_space_id;
  end if;

  update public.profiles set full_name = nullif(trim(p_full_name), '') where id = v_uid;

  insert into public.financial_spaces (name, type, owner_id)
  values (trim(p_space_name), p_space_type, v_uid)
  returning id into v_space_id;

  insert into public.financial_space_members (space_id, user_id, role) values (v_space_id, v_uid, 'owner');

  perform public.seed_space_defaults(v_space_id, p_category_keys);

  if p_plan_mode <> 'skip' then
    insert into public.monthly_plans (space_id, month, expected_income_cents, created_by)
    values (v_space_id, v_month, greatest(coalesce(p_expected_income_cents, 0), 0), v_uid)
    returning id into v_plan_id;

    insert into public.plan_group_budgets (plan_id, space_id, group_id, mode, percent_bp)
    select v_plan_id, v_space_id, g.id, 'percent',
      case
        when p_plan_mode = 'custom' then least(greatest(coalesce((p_group_percents ->> g.key)::int, 0), 0), 10000)
        when g.key = 'essentials' then 5000
        when g.key = 'lifestyle' then 4000
        when g.key = 'savings' then 1000
        else 0
      end
    from public.category_groups g
    where g.space_id = v_space_id;
  end if;

  update public.profiles set default_space_id = v_space_id, onboarded_at = now() where id = v_uid;
  return v_space_id;
end;
$$;

-- default_space_id must point to a space the user belongs to.
create or replace function public.validate_default_space()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_space_id is not null and new.default_space_id is distinct from old.default_space_id then
    if not exists (
      select 1 from public.financial_space_members m
      where m.space_id = new.default_space_id and m.user_id = new.id and m.status = 'active'
    ) then
      raise exception 'PRUMO_FORBIDDEN: not a member of the space' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_validate_default_space
  before update of default_space_id on public.profiles
  for each row execute function public.validate_default_space();

-- ─── Invitations ──────────────────────────────────────────────────────────────
create or replace function public.create_invitation(p_space_id uuid, p_email text, p_role text default 'member')
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_token text;
  v_limit integer;
  v_used integer;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'PRUMO_UNAUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_space_admin(p_space_id) then
    raise exception 'PRUMO_FORBIDDEN' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'PRUMO_INVALID: role' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.financial_space_members m
    join auth.users u on u.id = m.user_id
    where m.space_id = p_space_id and m.status = 'active' and lower(u.email) = v_email
  ) then
    raise exception 'PRUMO_CONFLICT: already a member' using errcode = '23505';
  end if;

  update public.space_invitations i set status = 'revoked'
  where i.space_id = p_space_id and i.email = v_email and i.status = 'pending';

  select p.max_members into v_limit
  from public.financial_spaces s join public.plans p on p.code = s.plan_code
  where s.id = p_space_id;
  select count(*) into v_used from public.financial_space_members m where m.space_id = p_space_id and m.status = 'active';
  v_used := v_used + (
    select count(*) from public.space_invitations i
    where i.space_id = p_space_id and i.status = 'pending' and i.expires_at > now()
  );
  if v_used >= v_limit then
    raise exception 'PRUMO_LIMIT_REACHED: members' using errcode = 'P0001';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');

  insert into public.space_invitations (space_id, email, role, token_hash, invited_by)
  values (p_space_id, v_email, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid)
  returning space_invitations.id, space_invitations.expires_at into v_id, v_expires;

  update public.financial_spaces s set type = 'shared' where s.id = p_space_id and s.type = 'personal';

  return query select v_id, v_token, v_expires;
end;
$$;

create or replace function public.get_invitation_preview(p_token text)
returns table (space_name text, inviter_name text, email_hint text, status text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.name,
    coalesce(p.full_name, 'Alguém'),
    -- Partial email: enough to recognise the right account, useless if the link leaks.
    left(split_part(i.email, '@', 1), 2) || '•••@' || split_part(i.email, '@', 2),
    case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status end,
    i.expires_at
  from public.space_invitations i
  join public.financial_spaces s on s.id = i.space_id
  join public.profiles p on p.id = i.invited_by
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.space_invitations;
  v_email text;
  v_limit integer;
  v_used integer;
begin
  if v_uid is null then
    raise exception 'PRUMO_UNAUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_inv from public.space_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if not found then
    raise exception 'PRUMO_NOT_FOUND: invitation' using errcode = 'P0002';
  end if;
  if v_inv.status = 'accepted' and v_inv.accepted_by = v_uid then
    return v_inv.space_id;
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'PRUMO_INVALID: invitation is %', v_inv.status using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'PRUMO_EXPIRED: invitation' using errcode = '22023';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is distinct from v_inv.email then
    raise exception 'PRUMO_EMAIL_MISMATCH' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.financial_space_members
    where space_id = v_inv.space_id and user_id = v_uid and status = 'active'
  ) then
    select p.max_members into v_limit
    from public.financial_spaces s join public.plans p on p.code = s.plan_code
    where s.id = v_inv.space_id;
    select count(*) into v_used from public.financial_space_members
    where space_id = v_inv.space_id and status = 'active';
    if v_used >= v_limit then
      raise exception 'PRUMO_LIMIT_REACHED: members' using errcode = 'P0001';
    end if;

    insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
    insert into public.financial_space_members (space_id, user_id, role)
    values (v_inv.space_id, v_uid, v_inv.role)
    on conflict (space_id, user_id) do update
      set status = 'active', role = excluded.role, removed_at = null, joined_at = now();
  end if;

  update public.space_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  update public.financial_spaces set type = 'shared' where id = v_inv.space_id and type = 'personal';

  update public.profiles
  set default_space_id = v_inv.space_id, onboarded_at = coalesce(onboarded_at, now())
  where id = v_uid;

  return v_inv.space_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.space_invitations where id = p_invitation_id;
  if v_space_id is null or not public.is_space_admin(v_space_id) then
    raise exception 'PRUMO_FORBIDDEN' using errcode = '42501';
  end if;
  update public.space_invitations set status = 'revoked' where id = p_invitation_id and status = 'pending';
end;
$$;

create or replace function public.remove_space_member(p_space_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor_role text := public.space_role(p_space_id);
  v_target_role text;
begin
  if v_uid is null or v_actor_role is null then
    raise exception 'PRUMO_FORBIDDEN' using errcode = '42501';
  end if;
  select role into v_target_role from public.financial_space_members
  where space_id = p_space_id and user_id = p_user_id and status = 'active';
  if v_target_role is null then
    raise exception 'PRUMO_NOT_FOUND: member' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' then
    raise exception 'PRUMO_FORBIDDEN: the owner cannot be removed' using errcode = '42501';
  end if;
  if p_user_id <> v_uid and not (v_actor_role = 'owner' or (v_actor_role = 'admin' and v_target_role = 'member')) then
    raise exception 'PRUMO_FORBIDDEN' using errcode = '42501';
  end if;

  update public.financial_space_members
  set status = 'removed', removed_at = now()
  where space_id = p_space_id and user_id = p_user_id;

  update public.profiles set default_space_id = null where id = p_user_id and default_space_id = p_space_id;
end;
$$;

-- ─── Aggregations (SECURITY INVOKER: RLS and privacy apply) ───────────────────
create or replace function public.space_category_totals(
  p_space_id uuid,
  p_from date,
  p_to date,
  p_member_id uuid default null,
  p_scope text default null
)
returns table (category_id uuid, type text, total_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.category_id, t.type, sum(t.amount_cents)::bigint, count(*)::bigint
  from public.transactions t
  where t.space_id = p_space_id
    and t.occurred_on between p_from and p_to
    and t.deleted_at is null
    and t.status = 'confirmed'
    and t.type in ('income', 'expense')
    and (p_member_id is null or t.member_id = p_member_id)
    and (p_scope is null or t.scope = p_scope)
  group by t.category_id, t.type;
$$;

create or replace function public.space_monthly_totals(
  p_space_id uuid,
  p_from date,
  p_to date,
  p_member_id uuid default null,
  p_scope text default null
)
returns table (month date, income_cents bigint, expense_cents bigint, savings_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('month', t.occurred_on)::date,
    coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.type = 'expense' and not coalesce(g.is_savings, false)), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.type = 'expense' and coalesce(g.is_savings, false)), 0)::bigint
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  left join public.category_groups g on g.id = c.group_id
  where t.space_id = p_space_id
    and t.occurred_on between p_from and p_to
    and t.deleted_at is null
    and t.status = 'confirmed'
    and t.type in ('income', 'expense')
    and (p_member_id is null or t.member_id = p_member_id)
    and (p_scope is null or t.scope = p_scope)
  group by 1
  order by 1;
$$;

create or replace function public.card_spend_totals(p_space_id uuid, p_from date, p_to date)
returns table (card_id uuid, total_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.card_id, sum(t.amount_cents)::bigint, count(*)::bigint
  from public.transactions t
  where t.space_id = p_space_id
    and t.card_id is not null
    and t.occurred_on between p_from and p_to
    and t.deleted_at is null
    and t.status = 'confirmed'
  group by t.card_id;
$$;

-- ─── Monthly plan: atomic replace of allocations ─────────────────────────────
create or replace function public.upsert_monthly_plan(
  p_space_id uuid,
  p_month date,
  p_expected_income_cents bigint,
  p_groups jsonb,
  p_categories jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'PRUMO_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.monthly_plans (space_id, month, expected_income_cents, created_by)
  values (p_space_id, date_trunc('month', p_month)::date, greatest(p_expected_income_cents, 0), auth.uid())
  on conflict (space_id, month) do update set expected_income_cents = excluded.expected_income_cents
  returning id into v_plan_id;

  delete from public.plan_group_budgets where plan_id = v_plan_id;
  insert into public.plan_group_budgets (plan_id, space_id, group_id, mode, percent_bp, amount_cents)
  select v_plan_id, p_space_id, (g ->> 'groupId')::uuid, g ->> 'mode',
         (g ->> 'percentBp')::integer, (g ->> 'amountCents')::bigint
  from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) g;

  delete from public.plan_category_budgets where plan_id = v_plan_id;
  insert into public.plan_category_budgets (plan_id, space_id, category_id, amount_cents)
  select v_plan_id, p_space_id, (c ->> 'categoryId')::uuid, (c ->> 'amountCents')::bigint
  from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) c;

  return v_plan_id;
end;
$$;

create or replace function public.copy_monthly_plan(p_space_id uuid, p_from_month date, p_to_month date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.monthly_plans;
  v_target_id uuid;
begin
  select * into v_source from public.monthly_plans
  where space_id = p_space_id and month = date_trunc('month', p_from_month)::date;
  if not found then
    raise exception 'PRUMO_NOT_FOUND: no plan in source month' using errcode = 'P0002';
  end if;

  insert into public.monthly_plans (space_id, month, expected_income_cents, notes, created_by)
  values (p_space_id, date_trunc('month', p_to_month)::date, v_source.expected_income_cents, v_source.notes, auth.uid())
  on conflict (space_id, month) do update set expected_income_cents = excluded.expected_income_cents
  returning id into v_target_id;

  delete from public.plan_group_budgets where plan_id = v_target_id;
  insert into public.plan_group_budgets (plan_id, space_id, group_id, mode, percent_bp, amount_cents)
  select v_target_id, space_id, group_id, mode, percent_bp, amount_cents
  from public.plan_group_budgets where plan_id = v_source.id;

  delete from public.plan_category_budgets where plan_id = v_target_id;
  insert into public.plan_category_budgets (plan_id, space_id, category_id, amount_cents)
  select v_target_id, space_id, category_id, amount_cents
  from public.plan_category_budgets where plan_id = v_source.id;

  return v_target_id;
end;
$$;

-- ─── WhatsApp linking ─────────────────────────────────────────────────────────
-- The user proves possession of the number by sending "PRUMO <code>" from it.
create or replace function public.start_whatsapp_link(p_phone_e164 text, p_space_id uuid)
returns table (identity_id uuid, code text, expires_at timestamptz, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_identity public.whatsapp_identities;
  v_bytes bytea;
  v_code text;
  v_expires timestamptz := now() + interval '15 minutes';
  v_recent integer;
begin
  if v_uid is null then
    raise exception 'PRUMO_UNAUTHENTICATED' using errcode = '28000';
  end if;
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'PRUMO_INVALID: phone' using errcode = '22023';
  end if;
  if not public.is_space_member(p_space_id) then
    raise exception 'PRUMO_FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.whatsapp_identities w
    where w.phone_e164 = p_phone_e164 and w.status = 'verified' and w.user_id <> v_uid
  ) then
    raise exception 'PRUMO_CONFLICT: phone linked to another account' using errcode = '23505';
  end if;

  select * into v_identity from public.whatsapp_identities w
  where w.user_id = v_uid and w.phone_e164 = p_phone_e164 and w.status <> 'revoked'
  for update;

  if found and v_identity.status = 'verified' then
    update public.whatsapp_identities w set default_space_id = p_space_id where w.id = v_identity.id;
    return query select v_identity.id, null::text, null::timestamptz, 'verified'::text;
    return;
  end if;

  select count(*) into v_recent from public.whatsapp_identities w
  where w.user_id = v_uid and w.updated_at > now() - interval '1 hour' and w.status = 'pending';
  if v_recent >= 5 and v_identity.id is null then
    raise exception 'PRUMO_LIMIT_REACHED: too many link attempts' using errcode = 'P0001';
  end if;

  v_bytes := extensions.gen_random_bytes(4);
  v_code := lpad((((get_byte(v_bytes, 0)::bigint << 24) | (get_byte(v_bytes, 1) << 16)
             | (get_byte(v_bytes, 2) << 8) | get_byte(v_bytes, 3)) % 1000000)::text, 6, '0');

  if v_identity.id is null then
    insert into public.whatsapp_identities (user_id, phone_e164, default_space_id)
    values (v_uid, p_phone_e164, p_space_id)
    returning * into v_identity;
  end if;

  update public.whatsapp_identities w
  set verification_code_hash = encode(extensions.digest(v_identity.id::text || ':' || v_code, 'sha256'), 'hex'),
      verification_expires_at = v_expires,
      verification_attempts = 0,
      default_space_id = p_space_id
  where w.id = v_identity.id;

  return query select v_identity.id, v_code, v_expires, 'pending'::text;
end;
$$;

create or replace function public.revoke_whatsapp_identity(p_identity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.whatsapp_identities
  set status = 'revoked', revoked_at = now(), verification_code_hash = null, verification_expires_at = null
  where id = p_identity_id and user_id = auth.uid() and status <> 'revoked';
  if not found then
    raise exception 'PRUMO_NOT_FOUND: identity' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_whatsapp_default_space(p_identity_id uuid, p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'PRUMO_FORBIDDEN' using errcode = '42501';
  end if;
  update public.whatsapp_identities set default_space_id = p_space_id
  where id = p_identity_id and user_id = auth.uid() and status <> 'revoked';
  if not found then
    raise exception 'PRUMO_NOT_FOUND: identity' using errcode = 'P0002';
  end if;
end;
$$;

-- ─── Retention (run by cron with the service role) ───────────────────────────
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages integer;
  v_actions integer;
  v_invites integer;
begin
  update public.whatsapp_messages set content = null, content_expires_at = null
  where content is not null and content_expires_at < now();
  get diagnostics v_messages = row_count;

  update public.whatsapp_pending_actions set status = 'expired', resolved_at = now()
  where status = 'open' and expires_at < now();
  get diagnostics v_actions = row_count;

  update public.space_invitations set status = 'expired'
  where status = 'pending' and expires_at < now();
  get diagnostics v_invites = row_count;

  return jsonb_build_object('messages', v_messages, 'actions', v_actions, 'invitations', v_invites);
end;
$$;

-- ─── Grants ───────────────────────────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.complete_onboarding(text, text, text, bigint, text, jsonb, text[]),
  public.create_invitation(uuid, text, text),
  public.get_invitation_preview(text),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.remove_space_member(uuid, uuid),
  public.space_category_totals(uuid, date, date, uuid, text),
  public.space_monthly_totals(uuid, date, date, uuid, text),
  public.card_spend_totals(uuid, date, date),
  public.upsert_monthly_plan(uuid, date, bigint, jsonb, jsonb),
  public.copy_monthly_plan(uuid, date, date),
  public.start_whatsapp_link(text, uuid),
  public.revoke_whatsapp_identity(uuid),
  public.set_whatsapp_default_space(uuid, uuid),
  public.is_space_member(uuid),
  public.space_role(uuid),
  public.is_space_admin(uuid),
  public.shares_space_with(uuid),
  public.can_view_transaction(uuid, text, uuid, uuid),
  public.can_edit_transaction(uuid, text, text, uuid, uuid)
to authenticated;

-- The invite landing page shows who invited you before sign-in.
grant execute on function public.get_invitation_preview(text) to anon;

-- Internal / server-only.
revoke execute on function public.seed_space_defaults(uuid, text[]) from authenticated;
revoke execute on function public.purge_expired_data() from authenticated;
grant execute on function public.purge_expired_data() to service_role;
grant execute on function public.seed_space_defaults(uuid, text[]) to service_role;
