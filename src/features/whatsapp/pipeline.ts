import { createHash, randomUUID } from 'node:crypto'
import { addDays, compareDates, diffInDays, isISODate, monthEnd, monthOf, monthProgress, monthStart, addMonths, todayIn } from '@/domain/dates'
import { PLAN_ENTITLEMENTS } from '@/domain/entitlements'
import { availableToSpend, buildPlanOverview, indexCategories, summarize } from '@/domain/finance'
import { parseMoneyToCents, splitInstallments } from '@/domain/money'
import { canEditTransaction } from '@/domain/permissions'
import type { Category, Transaction, TransactionSource, UUID } from '@/domain/types'
import { getAppUrl } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { logger as rootLogger, type Logger } from '@/lib/observability/logger'
import { AIUnavailableError, type AIOperation, type AIProvider, type AIUsage, type InterpretContext } from '@/features/ai/provider'
import { interpretWithRules, strip } from '@/features/ai/rules'
import type { Interpretation } from '@/features/ai/schemas'
import type { MediaSource, WhatsAppTransport } from './meta/client'
import type { InboundEvent, InboundMessage } from './meta/normalize'
import { phoneVariants } from './phone'
import { REPLIES } from './replies'
import type { ActingFinance, PendingAction, ProcessingStatus, ResolvedIdentity, SpaceSnapshot, WhatsAppStore } from './store'

/**
 * THE WhatsApp pipeline. Used identically by the Meta webhook and the local simulator:
 *
 *   inbound event → dedupe (wamid) → link code? → identity → space & membership
 *   → text | audio (transcribe) | image (extract receipt)
 *   → pending confirmation? → interpret (rules first, AI when needed, schema-validated)
 *   → deterministic validation & resolution (amount, date, category, card, scope)
 *   → register | ask to confirm | correct | delete | answer with SQL numbers
 *   → reply → record outbound
 *
 * Money, totals, budgets and pace are always computed by code — the AI only reads language.
 */

export interface PipelineDeps {
  store: WhatsAppStore
  transport: WhatsAppTransport
  media: MediaSource | null
  /** Language/vision provider. null = rules only (text still works). */
  ai: AIProvider | null
  logger?: Logger
}

export interface ProcessResult {
  status: ProcessingStatus | 'duplicate'
  messageId: UUID | null
  transactionIds: UUID[]
  intent: Interpretation | null
  source: 'rules' | 'ai' | null
}

// Thresholds (documented in docs/WHATSAPP.md → "Confirmação").
export const CONFIRMATION_RULES = {
  minConfidence: 0.75,
  largeAmountCents: 500_000, // R$ 5.000
  maxPastDays: 60,
  correctionWindowHours: 2,
  deleteLastWindowMinutes: 30,
  deleteSearchDays: 7,
} as const

const DEFAULT_SCOPE = 'shared' as const

interface Ctx {
  deps: PipelineDeps
  event: InboundMessage
  messageId: UUID
  correlationId: string
  identity: ResolvedIdentity
  snapshot: SpaceSnapshot
  today: string
  acting: ActingFinance
  log: Logger
  reply: Replier
}

interface Replier {
  text(body: string, transactionId?: UUID | null): Promise<void>
  buttons(body: string, buttons: { id: string; title: string }[]): Promise<void>
}

interface Draft {
  type: 'income' | 'expense'
  amountCents: number
  occurredOn: string
  description: string
  merchant: string | null
  categoryId: UUID | null
  accountId: UUID | null
  cardId: UUID | null
  installments: number | null
  scope: 'personal' | 'shared'
  source: TransactionSource
  sourceRef: string
  heard: string | null
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// ─── Entry points ────────────────────────────────────────────────────────────

export async function handleEvents(events: InboundEvent[], deps: PipelineDeps): Promise<ProcessResult[]> {
  const results: ProcessResult[] = []
  for (const event of events) {
    if (event.kind === 'status') {
      await deps.store.updateOutboundStatus(event.waMessageId, event.status, event.errorCode).catch((error) => {
        ;(deps.logger ?? rootLogger).warn('whatsapp.status_update_failed', { error })
      })
      continue
    }
    results.push(await processInbound(event, deps))
  }
  return results
}

export async function processInbound(event: InboundMessage, deps: PipelineDeps): Promise<ProcessResult> {
  const correlationId = randomUUID()
  const log = (deps.logger ?? rootLogger).child({ correlationId, waMessageId: event.waMessageId, type: event.type })
  const { store } = deps
  const senderHash = sha256(event.from)

  const recorded = await store.recordInbound({
    waMessageId: event.waMessageId,
    senderHash,
    type: event.type,
    content: event.type === 'text' || event.type === 'image' ? event.text : null,
    mediaId: event.mediaId,
    waTimestamp: event.timestamp,
    correlationId,
  })
  if (recorded.duplicate) {
    log.info('whatsapp.duplicate_ignored')
    return { status: 'duplicate', messageId: recorded.id, transactionIds: [], intent: null, source: null }
  }
  log.info('whatsapp.received')

  const phones = phoneVariants(event.from)
  const baseReplier = makeReplier(deps, event, recorded.id, correlationId, null, null, log)
  const done = async (status: ProcessingStatus, extra: Partial<ProcessResult> = {}, errorCode: string | null = null): Promise<ProcessResult> => {
    await store.updateInbound(recorded.id, { status, errorCode })
    await deps.transport.markAsRead(event.waMessageId).catch(() => undefined)
    return { status, messageId: recorded.id, transactionIds: [], intent: null, source: null, ...extra }
  }

  // 1. Link code: "PRUMO 123456" proves possession of the number.
  const link = event.type === 'text' ? /^\s*prumo\s*[:-]?\s*(\d{6})\s*$/i.exec(event.text ?? '') : null
  if (link) {
    const result = await store.verifyLinkCode(phones, link[1]!)
    log.info('whatsapp.link_attempt', { result: result.status })
    const name = result.userId ? await store.userName(result.userId) : ''
    const messages = {
      verified: REPLIES.linkVerified(name),
      invalid: REPLIES.linkInvalid,
      expired: REPLIES.linkExpired,
      locked: REPLIES.linkLocked,
      conflict: REPLIES.linkConflict,
      not_found: REPLIES.linkNotFound,
    }
    await store.updateInbound(recorded.id, { content: null, ...(result.userId ? { userId: result.userId } : {}) })
    await baseReplier.text(messages[result.status])
    return done(result.status === 'verified' ? 'processed' : 'ignored', {}, result.status === 'verified' ? null : `link_${result.status}`)
  }

  // 2. Identity: sender → verified identity → user.
  const identity = await store.findVerifiedIdentity(phones)
  if (!identity) {
    await store.updateInbound(recorded.id, { content: null })
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    if (!(await store.unknownSenderRepliedSince(senderHash, since))) await baseReplier.text(REPLIES.unknownSender(getAppUrl()))
    log.info('whatsapp.unknown_sender')
    return done('ignored', {}, 'unknown_sender')
  }

  // 3. Space and active membership.
  const snapshot = identity.defaultSpaceId ? await store.snapshot(identity.defaultSpaceId, identity.userId) : null
  if (!snapshot) {
    await baseReplier.text(REPLIES.noSpace(getAppUrl()))
    return done('ignored', {}, 'no_space')
  }
  await store.updateInbound(recorded.id, { status: 'processing', identityId: identity.identityId, userId: identity.userId, spaceId: snapshot.space.id })

  const ctx: Ctx = {
    deps,
    event,
    messageId: recorded.id,
    correlationId,
    identity,
    snapshot,
    today: todayIn(snapshot.space.timezone),
    acting: store.acting(snapshot.space.id, identity.userId),
    log: log.child({ spaceId: snapshot.space.id }),
    reply: makeReplier(deps, event, recorded.id, correlationId, identity, snapshot.space.id, log),
  }

  try {
    const result = await route(ctx)
    await deps.transport.markAsRead(event.waMessageId).catch(() => undefined)
    return result
  } catch (error) {
    ctx.log.error('whatsapp.processing_failed', { error })
    await store.updateInbound(recorded.id, { status: 'failed', errorCode: error instanceof AppError ? error.code : 'internal' })
    await ctx.reply.text(REPLIES.failure)
    return { status: 'failed', messageId: recorded.id, transactionIds: [], intent: null, source: null }
  }
}

// ─── Routing ─────────────────────────────────────────────────────────────────

async function route(ctx: Ctx): Promise<ProcessResult> {
  const { event, deps } = ctx
  const pending = await deps.store.getOpenAction(ctx.identity.identityId)

  if (event.type === 'interactive' && event.replyId) return handleButton(ctx, pending, event.replyId)
  if (event.type === 'image') return handleReceipt(ctx)
  if (event.type === 'document') return finish(ctx, 'ignored', REPLIES.documentNotSupported)
  if (event.type === 'unsupported') return finish(ctx, 'ignored', REPLIES.unsupported)

  let text = event.text ?? ''
  let source: TransactionSource = 'whatsapp_text'
  if (event.type === 'audio') {
    const transcript = await transcribe(ctx)
    if (transcript === null) return finish(ctx, 'ignored', REPLIES.mediaUnavailable)
    if (transcript === 'limit') return finish(ctx, 'ignored', REPLIES.aiLimit)
    text = transcript
    source = 'whatsapp_audio'
    await deps.store.updateInbound(ctx.messageId, { content: transcript })
  }

  if (pending) {
    const handled = await handlePendingText(ctx, pending, text)
    if (handled) return handled
  }

  const { interpretation, via } = await interpret(ctx, text)
  await deps.store.updateInbound(ctx.messageId, { intent: sanitizeIntent(interpretation, via) })
  ctx.log.info('whatsapp.interpreted', { operation: interpretation.operation, via, confidence: interpretation.confidence })
  const heard = source === 'whatsapp_audio' ? text : null

  switch (interpretation.operation) {
    case 'create_transaction':
      return handleCreate(ctx, interpretation, source, heard, via)
    case 'correct_last':
      return handleCorrection(ctx, interpretation, via)
    case 'delete_transaction':
      return handleDelete(ctx, interpretation, via)
    case 'query':
      return handleQuery(ctx, interpretation, via)
    case 'confirm_yes':
    case 'confirm_no':
      return finish(ctx, 'processed', REPLIES.nothingPending, { intent: interpretation, source: via })
    case 'help':
      return finish(ctx, 'processed', REPLIES.help, { intent: interpretation, source: via })
    default:
      return finish(ctx, 'processed', REPLIES.unknown, { intent: interpretation, source: via })
  }
}

async function finish(ctx: Ctx, status: ProcessingStatus, message: string | null, extra: Partial<ProcessResult> = {}, transactionId: UUID | null = null): Promise<ProcessResult> {
  if (message) await ctx.reply.text(message, transactionId)
  await ctx.deps.store.updateInbound(ctx.messageId, { status, ...(transactionId ? { transactionId } : {}) })
  return { status, messageId: ctx.messageId, transactionIds: transactionId ? [transactionId] : [], intent: null, source: null, ...extra }
}

// ─── AI orchestration ────────────────────────────────────────────────────────

function interpretContext(ctx: Ctx): InterpretContext {
  return {
    today: ctx.today,
    timezone: ctx.snapshot.space.timezone,
    categories: ctx.snapshot.categories.filter((c) => c.isActive).map((c) => ({ key: c.systemKey ?? c.name, name: c.name, kind: c.kind })),
    cards: ctx.snapshot.cards.filter((c) => c.isActive).map((c) => c.name),
    accounts: ctx.snapshot.accounts.filter((a) => a.isActive).map((a) => a.name),
    sharedSpace: ctx.snapshot.space.type === 'shared',
  }
}

async function withinAiQuota(ctx: Ctx): Promise<boolean> {
  const limit = PLAN_ENTITLEMENTS[ctx.snapshot.space.plan].aiActionsPerMonth
  const used = await ctx.deps.store.countAiUsageSince(ctx.snapshot.space.id, `${monthStart(monthOf(ctx.today))}T00:00:00Z`)
  return used < limit
}

async function logUsage(ctx: Ctx, operation: AIOperation, usage: AIUsage | null, success: boolean, provider?: AIProvider) {
  await ctx.deps.store
    .logAiUsage({
      userId: ctx.identity.userId,
      spaceId: ctx.snapshot.space.id,
      operation,
      provider: usage?.provider ?? provider?.name ?? 'unknown',
      model: usage?.model ?? 'unknown',
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      audioSeconds: usage?.audioSeconds ?? null,
      estimatedCostUsdMicros: usage?.estimatedCostUsdMicros ?? null,
      latencyMs: usage?.latencyMs ?? 0,
      success,
      correlationId: ctx.correlationId,
    })
    .catch((error) => ctx.log.warn('ai.usage_log_failed', { error }))
  ctx.log.info('ai.called', { operation, provider: usage?.provider ?? provider?.name, model: usage?.model, success, latencyMs: usage?.latencyMs })
}

async function interpret(ctx: Ctx, text: string): Promise<{ interpretation: Interpretation; via: 'rules' | 'ai' }> {
  const context = interpretContext(ctx)
  const rules = interpretWithRules(text, context)
  const ai = ctx.deps.ai
  const settled = rules.confidence >= 0.85 || ['confirm_yes', 'confirm_no', 'help'].includes(rules.operation)
  if (settled || !ai || ai.name === 'fixture' || !ai.capabilities.text) return { interpretation: rules, via: 'rules' }
  if (!(await withinAiQuota(ctx))) return { interpretation: rules, via: 'rules' }
  try {
    const { result, usage } = await ai.interpretText(text, context)
    await logUsage(ctx, 'interpret_text', usage, true)
    // Keep the deterministic reading when the model gives up but the rules found something.
    if (result.operation === 'unknown' && rules.operation !== 'unknown') return { interpretation: rules, via: 'rules' }
    return { interpretation: result, via: 'ai' }
  } catch (error) {
    await logUsage(ctx, 'interpret_text', null, false, ai)
    ctx.log.warn('ai.interpret_failed', { error })
    return { interpretation: rules, via: 'rules' }
  }
}

async function transcribe(ctx: Ctx): Promise<string | null | 'limit'> {
  const { ai, media } = ctx.deps
  if (!ai?.capabilities.audio || !media || !ctx.event.mediaId) return null
  if (!PLAN_ENTITLEMENTS[ctx.snapshot.space.plan].audioMessages || !(await withinAiQuota(ctx))) return 'limit'
  const file = await media.download(ctx.event.mediaId)
  try {
    const { text, usage } = await ai.transcribeAudio(file.bytes, file.mimeType)
    await logUsage(ctx, 'transcribe_audio', usage, true)
    return text.trim() || null
  } catch (error) {
    if (error instanceof AIUnavailableError) return null
    await logUsage(ctx, 'transcribe_audio', null, false, ai)
    throw error
  } finally {
    file.bytes.fill(0) // audio is never persisted; drop it from memory as well
  }
}

// ─── Resolution helpers (deterministic) ──────────────────────────────────────

function resolveCategory(snapshot: SpaceSnapshot, key: string | null, type: 'income' | 'expense'): Category | null {
  if (!key) return null
  const active = snapshot.categories.filter((c) => c.isActive && c.kind === type)
  const k = strip(key)
  return active.find((c) => c.systemKey === key) ?? active.find((c) => strip(c.name) === k) ?? null
}

function resolvePayment(snapshot: SpaceSnapshot, hint: string | null, type: 'income' | 'expense', userId: UUID): { accountId: UUID | null; cardId: UUID | null; label: string | null } {
  const cards = snapshot.cards.filter((c) => c.isActive)
  const accounts = snapshot.accounts.filter((a) => a.isActive)
  if (hint) {
    const h = strip(hint)
    const card = cards.find((c) => h.includes(strip(c.name)) || (c.lastFour && h.includes(c.lastFour)))
    if (card && type === 'expense') return { accountId: null, cardId: card.id, label: `cartão ${card.name}` }
    const account = accounts.find((a) => h.includes(strip(a.name)))
    if (account) return { accountId: account.id, cardId: null, label: account.name }
    if (/cartao|credito/.test(h) && type === 'expense') {
      const own = cards.filter((c) => c.holderId === userId)
      if (own.length === 1) return { accountId: null, cardId: own[0]!.id, label: `cartão ${own[0]!.name}` }
    }
    if (/dinheiro/.test(h)) {
      const cash = accounts.find((a) => a.type === 'cash')
      if (cash) return { accountId: cash.id, cardId: null, label: cash.name }
    }
  }
  return { accountId: null, cardId: null, label: null }
}

function resolveDate(raw: string | null, today: string): string {
  if (raw && isISODate(raw)) return raw
  return today
}

function categoryName(ctx: Ctx, id: UUID | null) {
  return id ? (ctx.snapshot.categories.find((c) => c.id === id)?.name ?? null) : null
}

function paymentLabel(ctx: Ctx, draft: Pick<Draft, 'accountId' | 'cardId'>) {
  if (draft.cardId) return `cartão ${ctx.snapshot.cards.find((c) => c.id === draft.cardId)?.name ?? ''}`.trim()
  if (draft.accountId) return ctx.snapshot.accounts.find((a) => a.id === draft.accountId)?.name ?? null
  return null
}

function summarizeDraft(ctx: Ctx, draft: Draft) {
  return REPLIES.summaryLine({
    amountCents: draft.amountCents,
    type: draft.type,
    category: categoryName(ctx, draft.categoryId),
    description: draft.description,
    date: draft.occurredOn,
    today: ctx.today,
    payment: paymentLabel(ctx, draft),
    installments: draft.installments,
  })
}

function sanitizeIntent(i: Interpretation, via: string) {
  // Stored for debugging and quality — no free-text user content beyond short labels.
  return { via, operation: i.operation, transactionType: i.transactionType, categoryKey: i.categoryKey, hasAmount: Boolean(i.amountText), date: i.date, installments: i.installments, scope: i.scope, question: i.question, confidence: i.confidence }
}

// ─── Create ──────────────────────────────────────────────────────────────────

function buildDraft(ctx: Ctx, it: Pick<Interpretation, 'transactionType' | 'amountText' | 'date' | 'description' | 'merchant' | 'categoryKey' | 'paymentHint' | 'installments' | 'scope'>, source: TransactionSource, heard: string | null): Draft | null {
  const amountCents = it.amountText ? parseMoneyToCents(it.amountText) : null
  if (!amountCents || amountCents <= 0) return null
  const type = it.transactionType ?? 'expense'
  const category = resolveCategory(ctx.snapshot, it.categoryKey, type)
  const payment = resolvePayment(ctx.snapshot, it.paymentHint, type, ctx.identity.userId)
  return {
    type,
    amountCents,
    occurredOn: resolveDate(it.date, ctx.today),
    description: (it.description || it.merchant || category?.name || (type === 'income' ? 'Receita' : 'Gasto')).slice(0, 140),
    merchant: it.merchant?.slice(0, 80) ?? null,
    categoryId: category?.id ?? null,
    accountId: payment.accountId,
    cardId: payment.cardId,
    installments: payment.cardId && it.installments && it.installments > 1 ? it.installments : null,
    scope: ctx.snapshot.space.type === 'personal' ? 'personal' : (it.scope ?? DEFAULT_SCOPE),
    source,
    sourceRef: ctx.event.waMessageId,
    heard,
  }
}

function confirmationReasons(draft: Draft, confidence: number, today: string): string[] {
  const reasons: string[] = []
  if (confidence < CONFIRMATION_RULES.minConfidence) reasons.push('low_confidence')
  if (draft.amountCents >= CONFIRMATION_RULES.largeAmountCents) reasons.push('large_amount')
  if (compareDates(draft.occurredOn, today) > 0) reasons.push('future_date')
  if (diffInDays(draft.occurredOn, today) > CONFIRMATION_RULES.maxPastDays) reasons.push('old_date')
  if (draft.installments) reasons.push('installments')
  if (draft.source === 'whatsapp_image') reasons.push('receipt')
  return reasons
}

async function handleCreate(ctx: Ctx, it: Interpretation, source: TransactionSource, heard: string | null, via: 'rules' | 'ai'): Promise<ProcessResult> {
  const draft = buildDraft(ctx, it, source, heard)
  if (!draft) return finish(ctx, 'processed', REPLIES.needAmount, { intent: it, source: via })
  return proposeOrCommit(ctx, draft, it.confidence, { intent: it, source: via })
}

async function proposeOrCommit(ctx: Ctx, draft: Draft, confidence: number, extra: Partial<ProcessResult>): Promise<ProcessResult> {
  if (!draft.categoryId) {
    const suggestions = suggestCategories(ctx, draft.type)
    await ctx.deps.store.saveAction({ identityId: ctx.identity.identityId, spaceId: ctx.snapshot.space.id, userId: ctx.identity.userId, kind: 'choose_category', payload: draft, messageId: ctx.messageId })
    await ctx.reply.buttons(REPLIES.chooseCategory(`${draft.heard ? `Entendi: “${draft.heard}”\n\n` : ''}${summarizeDraft(ctx, draft)}`), suggestions.map((c) => ({ id: `cat:${c.id}`, title: c.name.slice(0, 20) })))
    await ctx.deps.store.updateInbound(ctx.messageId, { status: 'needs_confirmation' })
    return { status: 'needs_confirmation', messageId: ctx.messageId, transactionIds: [], intent: null, source: null, ...extra }
  }
  const reasons = confirmationReasons(draft, confidence, ctx.today)
  if (reasons.length > 0) {
    await ctx.deps.store.saveAction({ identityId: ctx.identity.identityId, spaceId: ctx.snapshot.space.id, userId: ctx.identity.userId, kind: 'confirm_create', payload: draft, messageId: ctx.messageId })
    await ctx.reply.buttons(REPLIES.confirmCreate(summarizeDraft(ctx, draft), draft.heard), [
      { id: 'confirm:yes', title: 'Confirmar' },
      { id: 'confirm:no', title: 'Cancelar' },
    ])
    await ctx.deps.store.updateInbound(ctx.messageId, { status: 'needs_confirmation' })
    ctx.log.info('whatsapp.needs_confirmation', { reasons })
    return { status: 'needs_confirmation', messageId: ctx.messageId, transactionIds: [], intent: null, source: null, ...extra }
  }
  return commit(ctx, draft, extra)
}

function suggestCategories(ctx: Ctx, type: 'income' | 'expense'): Category[] {
  const byKey = (keys: string[]) => keys.map((k) => ctx.snapshot.categories.find((c) => c.systemKey === k && c.isActive)).filter((c): c is Category => Boolean(c))
  const preferred = type === 'income' ? byKey(['salary', 'extra_income', 'other_income']) : byKey(['groceries', 'restaurants', 'other'])
  return preferred.length === 3 ? preferred : ctx.snapshot.categories.filter((c) => c.kind === type && c.isActive).slice(0, 3)
}

async function commit(ctx: Ctx, draft: Draft, extra: Partial<ProcessResult>): Promise<ProcessResult> {
  let created: Transaction[]
  try {
    created = await ctx.acting.createTransactions({
      type: draft.type,
      amountCents: draft.amountCents,
      occurredOn: draft.occurredOn,
      description: draft.description,
      merchant: draft.merchant,
      notes: null,
      categoryId: draft.categoryId,
      accountId: draft.accountId,
      cardId: draft.cardId,
      memberId: ctx.identity.userId,
      scope: draft.scope,
      visibility: 'space',
      installments: draft.installments ?? undefined,
      source: draft.source,
      sourceRef: draft.sourceRef,
    })
  } catch (error) {
    if (error instanceof AppError && error.code === 'CONFLICT') return finish(ctx, 'processed', REPLIES.duplicate, extra)
    throw error
  }
  const first = created[0]!
  ctx.log.info('transaction.created', { transactionId: first.id, source: draft.source, rows: created.length })

  const category = categoryName(ctx, draft.categoryId)
  const message = draft.installments
    ? REPLIES.registeredInstallments(draft.amountCents, draft.installments, splitInstallments(draft.amountCents, draft.installments)[1] ?? 0, category)
    : REPLIES.registered(draft.amountCents, category, await paceNote(ctx, draft))
  await ctx.reply.text(message, first.id)
  await ctx.deps.store.updateInbound(ctx.messageId, { status: 'processed', transactionId: first.id })
  return { status: 'processed', messageId: ctx.messageId, transactionIds: created.map((t) => t.id), intent: null, source: null, ...extra }
}

/** Deterministic budget note after registering an expense (numbers from SQL/code). */
async function paceNote(ctx: Ctx, draft: Draft): Promise<string | null> {
  if (draft.type !== 'expense' || !draft.categoryId || monthOf(draft.occurredOn) !== monthOf(ctx.today)) return null
  const month = monthOf(ctx.today)
  const plan = await ctx.acting.getPlan(month)
  const budget = plan?.categories.find((c) => c.categoryId === draft.categoryId)
  if (!budget || budget.amountCents <= 0) return null
  const totals = await ctx.acting.categoryTotals(monthStart(month), monthEnd(month))
  const spent = totals.filter((t) => t.categoryId === draft.categoryId && t.type === 'expense').reduce((a, t) => a + t.totalCents, 0)
  const progress = monthProgress(month, ctx.today)
  return REPLIES.pace(categoryName(ctx, draft.categoryId) ?? 'categoria', spent / budget.amountCents, progress.elapsedRatio)
}

// ─── Pending confirmations ───────────────────────────────────────────────────

async function handleButton(ctx: Ctx, pending: PendingAction | null, replyId: string): Promise<ProcessResult> {
  if (!pending) return finish(ctx, 'processed', REPLIES.nothingPending)
  const [kind, value] = replyId.split(':') as [string, string | undefined]
  if (kind === 'confirm' || kind === 'del') return resolvePending(ctx, pending, value === 'yes' ? 'yes' : 'no')
  if (kind === 'cat' && value && pending.kind === 'choose_category') return resolvePending(ctx, pending, 'category', value)
  if (kind === 'pick' && value && pending.kind === 'choose_candidate') return resolvePending(ctx, pending, 'pick', value)
  return finish(ctx, 'processed', REPLIES.nothingPending)
}

async function handlePendingText(ctx: Ctx, pending: PendingAction, text: string): Promise<ProcessResult | null> {
  const normalized = strip(text.trim())
  const quick = interpretWithRules(text, interpretContext(ctx))
  if (quick.operation === 'confirm_yes') return resolvePending(ctx, pending, 'yes')
  if (quick.operation === 'confirm_no') return resolvePending(ctx, pending, 'no')
  if (pending.kind === 'choose_category') {
    const draft = pending.payload as Draft
    const category = ctx.snapshot.categories.find((c) => c.isActive && c.kind === draft.type && strip(c.name) === normalized)
    if (category) return resolvePending(ctx, pending, 'category', category.id)
  }
  if (pending.kind === 'choose_candidate') {
    const index = Number(normalized) - 1
    const ids = (pending.payload as { ids: UUID[] }).ids
    if (Number.isInteger(index) && ids[index]) return resolvePending(ctx, pending, 'pick', ids[index])
  }
  // Anything else is a new message: the open question is dropped.
  await ctx.deps.store.closeAction(pending.id, 'cancelled')
  return null
}

async function resolvePending(ctx: Ctx, pending: PendingAction, answer: 'yes' | 'no' | 'category' | 'pick', value?: string): Promise<ProcessResult> {
  const { store } = ctx.deps
  if (pending.spaceId !== ctx.snapshot.space.id) {
    await store.closeAction(pending.id, 'cancelled')
    return finish(ctx, 'processed', REPLIES.nothingPending)
  }
  if (answer === 'no') {
    await store.closeAction(pending.id, 'cancelled')
    return finish(ctx, 'processed', REPLIES.cancelled)
  }
  await store.closeAction(pending.id, 'resolved')

  if (pending.kind === 'confirm_create' || pending.kind === 'choose_category') {
    const draft = { ...(pending.payload as Draft) }
    if (answer === 'category' && value) {
      const category = ctx.snapshot.categories.find((c) => c.id === value && c.kind === draft.type)
      if (!category) return finish(ctx, 'processed', REPLIES.nothingPending)
      draft.categoryId = category.id
      if (draft.description === 'Gasto' || draft.description === 'Receita') draft.description = category.name
    }
    return commit(ctx, draft, {})
  }

  const targetId = pending.kind === 'confirm_delete' ? (pending.payload as { id: UUID }).id : answer === 'pick' ? value : undefined
  if (!targetId) return finish(ctx, 'processed', REPLIES.nothingPending)
  const tx = await ctx.acting.getTransaction(targetId)
  if (!tx || !canEditTransaction(tx, ctx.identity.userId)) return finish(ctx, 'processed', REPLIES.deleteNotFound)
  await ctx.acting.softDelete(tx.id)
  ctx.log.info('transaction.deleted', { transactionId: tx.id, via: 'whatsapp' })
  return finish(ctx, 'processed', REPLIES.deleted(txLabel(tx, ctx.today)))
}

// ─── Corrections ─────────────────────────────────────────────────────────────

async function correctionTarget(ctx: Ctx): Promise<Transaction | null> {
  // Explicit: the user replied to our confirmation message → that transaction.
  if (ctx.event.contextId) {
    const id = await ctx.deps.store.transactionForMessage(ctx.event.contextId, ctx.identity.userId)
    if (id) return ctx.acting.getTransaction(id)
  }
  // Implicit: only the user's own most recent registration, within a short window.
  const since = new Date(Date.now() - CONFIRMATION_RULES.correctionWindowHours * 3_600_000).toISOString()
  const [last] = await ctx.acting.recentlyCreated(since, 1)
  return last ?? null
}

async function handleCorrection(ctx: Ctx, it: Interpretation, via: 'rules' | 'ai'): Promise<ProcessResult> {
  const target = await correctionTarget(ctx)
  if (!target || !canEditTransaction(target, ctx.identity.userId)) return finish(ctx, 'processed', REPLIES.nothingToCorrect, { intent: it, source: via })

  const amountCents = it.amountText ? parseMoneyToCents(it.amountText) : null
  const category = resolveCategory(ctx.snapshot, it.categoryKey, target.type === 'income' ? 'income' : 'expense')
  const payment = resolvePayment(ctx.snapshot, it.paymentHint, target.type === 'income' ? 'income' : 'expense', ctx.identity.userId)
  const date = it.date && isISODate(it.date) ? it.date : null
  const scope = ctx.snapshot.space.type === 'shared' ? it.scope : null
  const changes = [amountCents && amountCents > 0, category, payment.accountId || payment.cardId, date, scope].filter(Boolean).length
  if (changes === 0) return finish(ctx, 'processed', REPLIES.correctionEmpty, { intent: it, source: via })

  const updated = await ctx.acting.updateTransaction(target.id, {
    type: target.type === 'income' ? 'income' : 'expense',
    amountCents: amountCents && amountCents > 0 ? amountCents : target.amountCents,
    occurredOn: date ?? target.occurredOn,
    description: target.description,
    merchant: target.merchant,
    notes: target.notes,
    categoryId: category?.id ?? target.categoryId,
    accountId: payment.cardId ? null : (payment.accountId ?? target.accountId),
    cardId: payment.accountId ? null : (payment.cardId ?? target.cardId),
    memberId: target.memberId,
    scope: scope ?? target.scope,
    visibility: scope === 'shared' ? 'space' : target.visibility,
  })
  ctx.log.info('transaction.corrected', { transactionId: updated.id })
  const summary = [
    formatAmount(updated.amountCents),
    categoryName(ctx, updated.categoryId),
    paymentLabel(ctx, updated),
    updated.scope === 'shared' && ctx.snapshot.space.type === 'shared' ? 'compartilhado' : ctx.snapshot.space.type === 'shared' ? 'pessoal' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return finish(ctx, 'processed', REPLIES.corrected(summary), { intent: it, source: via }, updated.id)
}

const formatAmount = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/ /g, ' ')

function txLabel(tx: Transaction, today: string) {
  const when = tx.occurredOn === today ? 'hoje' : tx.occurredOn === addDays(today, -1) ? 'ontem' : `${tx.occurredOn.slice(8, 10)}/${tx.occurredOn.slice(5, 7)}`
  return `${tx.description} de ${formatAmount(tx.amountCents)} (${when})`
}

// ─── Delete ──────────────────────────────────────────────────────────────────

async function handleDelete(ctx: Ctx, it: Interpretation, via: 'rules' | 'ai'): Promise<ProcessResult> {
  const extra = { intent: it, source: via } as const
  const hint = strip(it.targetHint ?? '')

  // "apaga o último": unambiguous only for the user's own registration made minutes ago.
  if (!hint || hint === 'ultimo') {
    const since = new Date(Date.now() - CONFIRMATION_RULES.deleteLastWindowMinutes * 60_000).toISOString()
    const [last] = await ctx.acting.recentlyCreated(since, 1)
    if (!last) return finish(ctx, 'processed', REPLIES.deleteNotFound, extra)
    await ctx.acting.softDelete(last.id)
    ctx.log.info('transaction.deleted', { transactionId: last.id, via: 'whatsapp_last' })
    return finish(ctx, 'processed', REPLIES.deleted(txLabel(last, ctx.today)), extra)
  }

  const words = hint.split(/\s+/).filter((w) => w.length > 2 && !['ontem', 'hoje', 'anteontem', 'reais'].includes(w) && !/^\d/.test(w))
  const amountCents = it.amountText ? parseMoneyToCents(it.amountText) : null
  const category = resolveCategory(ctx.snapshot, it.categoryKey, 'expense')
  const recent = await ctx.acting.visibleSince(addDays(ctx.today, -CONFIRMATION_RULES.deleteSearchDays), 60)
  const candidates = recent.filter((tx) => {
    if (!canEditTransaction(tx, ctx.identity.userId)) return false
    if (it.date && tx.occurredOn !== it.date) return false
    if (amountCents && tx.amountCents !== amountCents) return false
    if (category && tx.categoryId !== category.id && words.length === 0) return false
    const haystack = strip(`${tx.description} ${tx.merchant ?? ''} ${categoryName(ctx, tx.categoryId) ?? ''}`)
    return words.length === 0 ? Boolean(category || amountCents || it.date) : words.some((w) => haystack.includes(w))
  })

  if (candidates.length === 0) return finish(ctx, 'processed', REPLIES.deleteNotFound, extra)
  if (candidates.length > 3) return finish(ctx, 'processed', REPLIES.deleteTooMany, extra)
  const base = { identityId: ctx.identity.identityId, spaceId: ctx.snapshot.space.id, userId: ctx.identity.userId, messageId: ctx.messageId }
  if (candidates.length === 1) {
    const tx = candidates[0]!
    await ctx.deps.store.saveAction({ ...base, kind: 'confirm_delete', payload: { id: tx.id } })
    await ctx.reply.buttons(REPLIES.confirmDelete(txLabel(tx, ctx.today)), [
      { id: 'del:yes', title: 'Apagar' },
      { id: 'del:no', title: 'Manter' },
    ])
  } else {
    await ctx.deps.store.saveAction({ ...base, kind: 'choose_candidate', payload: { ids: candidates.map((c) => c.id) } })
    await ctx.reply.buttons(
      `${REPLIES.chooseCandidate}\n${candidates.map((c, i) => `${i + 1}. ${txLabel(c, ctx.today)}`).join('\n')}`,
      candidates.map((c, i) => ({ id: `pick:${c.id}`, title: `${i + 1}. ${c.description}`.slice(0, 20) })),
    )
  }
  await ctx.deps.store.updateInbound(ctx.messageId, { status: 'needs_confirmation' })
  return { status: 'needs_confirmation', messageId: ctx.messageId, transactionIds: [], ...extra }
}

// ─── Receipts (image) ────────────────────────────────────────────────────────

async function handleReceipt(ctx: Ctx): Promise<ProcessResult> {
  const { ai, media } = ctx.deps
  if (!ai?.capabilities.vision || !media || !ctx.event.mediaId) return finish(ctx, 'ignored', REPLIES.mediaUnavailable)
  if (!PLAN_ENTITLEMENTS[ctx.snapshot.space.plan].receiptImages || !(await withinAiQuota(ctx))) return finish(ctx, 'ignored', REPLIES.aiLimit)

  const file = await media.download(ctx.event.mediaId)
  let extraction
  try {
    const { result, usage } = await ai.extractReceipt(file.bytes, file.mimeType, interpretContext(ctx))
    await logUsage(ctx, 'extract_receipt', usage, true)
    extraction = result
  } catch (error) {
    if (error instanceof AIUnavailableError) return finish(ctx, 'ignored', REPLIES.mediaUnavailable)
    await logUsage(ctx, 'extract_receipt', null, false, ai)
    throw error
  } finally {
    file.bytes.fill(0) // the image is never stored
  }

  await ctx.deps.store.updateInbound(ctx.messageId, { intent: { via: 'ai', operation: 'extract_receipt', isReceipt: extraction.isReceipt, hasAmount: Boolean(extraction.totalText), categoryKey: extraction.categoryKey, confidence: extraction.confidence } })
  if (!extraction.isReceipt) return finish(ctx, 'processed', REPLIES.notReceipt)

  // Receipt dates are trusted only when plausible; otherwise the message date is used.
  const receiptDate = extraction.date && isISODate(extraction.date) && compareDates(extraction.date, ctx.today) <= 0 && diffInDays(extraction.date, ctx.today) <= CONFIRMATION_RULES.maxPastDays ? extraction.date : null
  const draft = buildDraft(
    ctx,
    {
      transactionType: 'expense',
      amountText: extraction.totalText,
      date: receiptDate,
      description: extraction.merchant,
      merchant: extraction.merchant,
      categoryKey: extraction.categoryKey,
      paymentHint: extraction.paymentHint,
      installments: extraction.installments,
      scope: null,
    },
    'whatsapp_image',
    ctx.event.text,
  )
  if (!draft) return finish(ctx, 'processed', REPLIES.receiptUnreadable)
  draft.heard = null
  // Photos are always confirmed before registering.
  return proposeOrCommit(ctx, draft, Math.min(extraction.confidence, 0.7), {})
}

// ─── Questions (numbers from SQL, never from the model) ──────────────────────

async function handleQuery(ctx: Ctx, it: Interpretation, via: 'rules' | 'ai'): Promise<ProcessResult> {
  const extra = { intent: it, source: via } as const
  const month = monthOf(ctx.today)
  const from = monthStart(month)
  const to = monthEnd(month)
  const totals = await ctx.acting.categoryTotals(from, to)
  const index = indexCategories(ctx.snapshot.categories, ctx.snapshot.groups)
  const summary = summarize(totals, index)

  switch (it.question) {
    case 'spent_in_category': {
      const category = resolveCategory(ctx.snapshot, it.categoryKey, 'expense')
      if (!category) break
      const row = totals.filter((t) => t.categoryId === category.id && t.type === 'expense')
      const total = row.reduce((a, t) => a + t.totalCents, 0)
      const count = row.reduce((a, t) => a + t.count, 0)
      const plan = await ctx.acting.getPlan(month)
      const planned = plan?.categories.find((c) => c.categoryId === category.id)?.amountCents ?? null
      return finish(ctx, 'processed', REPLIES.categorySpent(category.name, month, total, count, planned), extra)
    }
    case 'remaining_budget': {
      const plan = await ctx.acting.getPlan(month)
      if (!plan) return finish(ctx, 'processed', REPLIES.remainingNoPlan, extra)
      const progress = monthProgress(month, ctx.today)
      const overview = buildPlanOverview({ month, plan, groups: ctx.snapshot.groups, categories: ctx.snapshot.categories, totals, index, progress })
      const available = availableToSpend(overview, summary.expenseCents, summary, progress)
      return finish(ctx, 'processed', REPLIES.remaining(available.availableCents, available.perDayCents), extra)
    }
    case 'top_category': {
      const progress = monthProgress(month, ctx.today)
      const prevMonth = addMonths(month, -1)
      const prevTo = addDays(monthStart(prevMonth), progress.elapsedDays - 1)
      const previous = await ctx.acting.categoryTotals(monthStart(prevMonth), compareDates(prevTo, monthEnd(prevMonth)) > 0 ? monthEnd(prevMonth) : prevTo)
      const deltas = totals
        .filter((t) => t.type === 'expense' && t.categoryId)
        .map((t) => ({ id: t.categoryId!, delta: t.totalCents - (previous.find((p) => p.categoryId === t.categoryId && p.type === 'expense')?.totalCents ?? 0) }))
        .sort((a, b) => b.delta - a.delta)
      const top = deltas[0]
      if (!top || top.delta <= 0) return finish(ctx, 'processed', REPLIES.noIncrease, extra)
      return finish(ctx, 'processed', REPLIES.topIncrease(categoryName(ctx, top.id) ?? 'Uma categoria', top.delta, prevMonth), extra)
    }
  }
  return finish(ctx, 'processed', REPLIES.monthSummary(month, summary.incomeCents, summary.expenseCents, summary.resultCents), extra)
}

// ─── Replies ─────────────────────────────────────────────────────────────────

function makeReplier(deps: PipelineDeps, event: InboundMessage, inboundId: UUID, correlationId: string, identity: ResolvedIdentity | null, spaceId: UUID | null, log: Logger): Replier {
  const record = async (waMessageId: string | null, transactionId: UUID | null) =>
    deps.store
      .recordOutbound({ waMessageId, identityId: identity?.identityId ?? null, userId: identity?.userId ?? null, spaceId, replyToId: inboundId, transactionId, correlationId })
      .catch((error) => log.warn('whatsapp.outbound_record_failed', { error }))
  return {
    async text(body, transactionId = null) {
      try {
        const { waMessageId } = await deps.transport.sendText(event.from, body, { replyTo: event.waMessageId })
        await record(waMessageId, transactionId)
      } catch (error) {
        log.error('whatsapp.reply_failed', { error })
      }
    },
    async buttons(body, buttons) {
      try {
        const { waMessageId } = await deps.transport.sendButtons(event.from, body, buttons, { replyTo: event.waMessageId })
        await record(waMessageId, null)
      } catch (error) {
        log.error('whatsapp.reply_failed', { error })
      }
    },
  }
}
