-- PRUMO · 0600 · Server-side functions for trusted pipelines (WhatsApp webhook, cron).
--
-- The webhook runs with the service role (no user session), so RLS does not filter rows.
-- These functions take the acting user explicitly and apply the SAME membership and
-- privacy rules as the RLS policies. Executable by service_role only.

create or replace function public.space_category_totals_as(
  p_viewer uuid,
  p_space_id uuid,
  p_from date,
  p_to date
)
returns table (category_id uuid, type text, total_cents bigint, tx_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.category_id, t.type, sum(t.amount_cents)::bigint, count(*)::bigint
  from public.transactions t
  where t.space_id = p_space_id
    and exists (
      select 1 from public.financial_space_members m
      where m.space_id = p_space_id and m.user_id = p_viewer and m.status = 'active'
    )
    and (t.visibility = 'space' or t.member_id = p_viewer or t.created_by = p_viewer)
    and t.occurred_on between p_from and p_to
    and t.deleted_at is null
    and t.status = 'confirmed'
    and t.type in ('income', 'expense')
  group by t.category_id, t.type;
$$;

-- WhatsApp link verification: phone possession proven by the inbound message itself.
create or replace function public.verify_whatsapp_link(p_phones text[], p_code text)
returns table (status text, identity_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_identity public.whatsapp_identities;
begin
  select * into v_identity from public.whatsapp_identities w
  where w.phone_e164 = any (p_phones) and w.status = 'pending' and w.verification_code_hash is not null
  order by w.updated_at desc
  limit 1
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_identity.verification_expires_at < now() then
    return query select 'expired'::text, v_identity.id, v_identity.user_id;
    return;
  end if;
  if v_identity.verification_attempts >= 5 then
    return query select 'locked'::text, v_identity.id, v_identity.user_id;
    return;
  end if;
  if v_identity.verification_code_hash <> encode(extensions.digest(v_identity.id::text || ':' || p_code, 'sha256'), 'hex') then
    update public.whatsapp_identities w set verification_attempts = w.verification_attempts + 1 where w.id = v_identity.id;
    return query select 'invalid'::text, v_identity.id, v_identity.user_id;
    return;
  end if;
  if exists (
    select 1 from public.whatsapp_identities w
    where w.phone_e164 = v_identity.phone_e164 and w.status = 'verified' and w.user_id <> v_identity.user_id
  ) then
    return query select 'conflict'::text, v_identity.id, v_identity.user_id;
    return;
  end if;

  -- One verified number per user per phone; older links of the same user are superseded.
  update public.whatsapp_identities w set status = 'revoked', revoked_at = now()
  where w.user_id = v_identity.user_id and w.phone_e164 = v_identity.phone_e164 and w.status = 'verified';

  update public.whatsapp_identities w
  set status = 'verified', verified_at = now(), verification_code_hash = null, verification_expires_at = null
  where w.id = v_identity.id;

  return query select 'verified'::text, v_identity.id, v_identity.user_id;
end;
$$;

revoke execute on function public.space_category_totals_as(uuid, uuid, date, date) from public, anon, authenticated;
revoke execute on function public.verify_whatsapp_link(text[], text) from public, anon, authenticated;
grant execute on function public.space_category_totals_as(uuid, uuid, date, date) to service_role;
grant execute on function public.verify_whatsapp_link(text[], text) to service_role;
