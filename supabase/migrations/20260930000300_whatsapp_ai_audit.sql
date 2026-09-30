-- PRUMO · 0300 · WhatsApp identities & messages, AI usage metering, audit log.

-- ─── WhatsApp identities: sender phone → user → default space ────────────────
create table public.whatsapp_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'revoked')),
  default_space_id uuid references public.financial_spaces (id) on delete set null,
  -- Link verification: the user sends "PRUMO <code>" from the phone; only the hash is stored.
  verification_code_hash text,
  verification_expires_at timestamptz,
  verification_attempts smallint not null default 0,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A phone number can be verified for only one user at a time.
create unique index whatsapp_identities_verified_phone
  on public.whatsapp_identities (phone_e164)
  where status = 'verified';

create unique index whatsapp_identities_user_phone_active
  on public.whatsapp_identities (user_id, phone_e164)
  where status <> 'revoked';

create trigger whatsapp_identities_updated_at before update on public.whatsapp_identities
  for each row execute function public.set_updated_at();

-- ─── WhatsApp messages: technical log for idempotency and correlation ─────────
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inbound', 'outbound')),
  wa_message_id text check (wa_message_id is null or char_length(wa_message_id) <= 200),
  identity_id uuid references public.whatsapp_identities (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  space_id uuid references public.financial_spaces (id) on delete set null,
  -- SHA-256 of the sender wa_id: lets us correlate unknown senders without storing the number.
  sender_hash text,
  message_type text not null
    check (message_type in ('text', 'audio', 'image', 'document', 'interactive', 'reaction', 'unsupported', 'system')),
  status text not null
    check (status in ('received', 'processing', 'needs_confirmation', 'processed', 'ignored', 'failed', 'sent', 'delivered', 'read')),
  -- Short-lived content (text/transcript/caption). Purged after content_expires_at.
  content text check (content is null or char_length(content) <= 4096),
  content_expires_at timestamptz,
  media_id text,
  -- Validated, structured interpretation (never raw model output).
  intent jsonb,
  error_code text,
  correlation_id uuid not null default gen_random_uuid(),
  reply_to_id uuid references public.whatsapp_messages (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  wa_timestamp timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

-- Deduplication: Meta may deliver the same webhook more than once.
create unique index whatsapp_messages_wamid_unique
  on public.whatsapp_messages (direction, wa_message_id)
  where wa_message_id is not null;

create index whatsapp_messages_identity_idx on public.whatsapp_messages (identity_id, received_at desc);
create index whatsapp_messages_open_idx on public.whatsapp_messages (status) where status in ('received', 'processing');
create index whatsapp_messages_content_expiry_idx on public.whatsapp_messages (content_expires_at) where content is not null;
create index whatsapp_messages_space_idx on public.whatsapp_messages (space_id, received_at desc);

-- ─── Conversation state: one open question per identity ─────────────────────
create table public.whatsapp_pending_actions (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.whatsapp_identities (id) on delete cascade,
  space_id uuid not null references public.financial_spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('confirm_create', 'choose_category', 'confirm_delete', 'confirm_update', 'choose_candidate')),
  payload jsonb not null,
  message_id uuid references public.whatsapp_messages (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index whatsapp_pending_actions_one_open
  on public.whatsapp_pending_actions (identity_id)
  where status = 'open';

-- ─── AI usage metering (cost per user/space → plan design) ───────────────────
create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  space_id uuid references public.financial_spaces (id) on delete set null,
  operation text not null
    check (operation in ('interpret_text', 'transcribe_audio', 'extract_receipt', 'answer_question')),
  provider text not null check (char_length(provider) <= 40),
  model text not null check (char_length(model) <= 80),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  audio_seconds numeric(8, 2),
  estimated_cost_usd_micros bigint,
  latency_ms integer,
  success boolean not null,
  correlation_id uuid,
  created_at timestamptz not null default now()
);

create index ai_usage_events_space_idx on public.ai_usage_events (space_id, created_at desc);
create index ai_usage_events_user_idx on public.ai_usage_events (user_id, created_at desc);

-- ─── Audit log (critical operations only) ────────────────────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  space_id uuid references public.financial_spaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 60),
  entity_type text not null check (char_length(entity_type) <= 40),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_space_idx on public.audit_log (space_id, created_at desc);

create or replace function public.audit_transactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_changed text[];
begin
  if tg_op = 'INSERT' then
    v_action := 'transaction.created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'transaction.deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'transaction.restored';
  else
    v_action := 'transaction.updated';
    select array_agg(key order by key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where key not in ('updated_at') and n.value is distinct from (to_jsonb(old) -> key);
    if v_changed is null then
      return new;
    end if;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    new.space_id,
    coalesce(auth.uid(), new.created_by),
    v_action,
    'transaction',
    new.id,
    jsonb_strip_nulls(jsonb_build_object('source', new.source, 'type', new.type, 'fields', v_changed))
  );
  return new;
end;
$$;

create trigger transactions_audit after insert or update on public.transactions
  for each row execute function public.audit_transactions();

create or replace function public.audit_memberships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'member.joined';
  elsif old.status = 'active' and new.status = 'removed' then
    v_action := 'member.removed';
  elsif old.status = 'removed' and new.status = 'active' then
    v_action := 'member.rejoined';
  elsif old.role <> new.role then
    v_action := 'member.role_changed';
  else
    return new;
  end if;
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, metadata)
  values (new.space_id, coalesce(auth.uid(), new.user_id), v_action, 'member', new.user_id,
          jsonb_build_object('role', new.role));
  return new;
end;
$$;

create trigger financial_space_members_audit after insert or update on public.financial_space_members
  for each row execute function public.audit_memberships();

create or replace function public.audit_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'invitation.created';
  elsif old.status <> new.status then
    v_action := 'invitation.' || new.status;
  else
    return new;
  end if;
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, metadata)
  values (new.space_id, coalesce(auth.uid(), new.invited_by), v_action, 'invitation', new.id,
          jsonb_build_object('role', new.role));
  return new;
end;
$$;

create trigger space_invitations_audit after insert or update on public.space_invitations
  for each row execute function public.audit_invitations();

create or replace function public.audit_spaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.name is distinct from new.name or old.plan_code is distinct from new.plan_code or old.type is distinct from new.type then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, metadata)
    values (new.id, auth.uid(), 'space.updated', 'space', new.id,
            jsonb_build_object('plan', new.plan_code, 'type', new.type));
  end if;
  return new;
end;
$$;

create trigger financial_spaces_audit after update on public.financial_spaces
  for each row execute function public.audit_spaces();
