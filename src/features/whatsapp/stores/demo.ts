import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { canEditTransaction } from '@/domain/permissions'
import type { UUID } from '@/domain/types'
import { AppError } from '@/lib/errors'
import { DemoRepository } from '@/server/data/demo/repository'
import type { DemoDb } from '@/server/data/demo/store'
import type { ActingFinance, PendingAction, WhatsAppStore } from '../store'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** In-memory store for the demo mode — shares the same data as the demo dashboard. */
export class DemoWhatsAppStore implements WhatsAppStore {
  readonly mode = 'demo' as const

  constructor(private readonly db: DemoDb) {}

  async recordInbound(input: Parameters<WhatsAppStore['recordInbound']>[0]) {
    const existing = this.db.messages.find((m) => m.direction === 'inbound' && m.waMessageId === input.waMessageId)
    if (existing) return { id: existing.id, duplicate: true }
    const id = randomUUID()
    this.db.messages.push({
      id,
      direction: 'inbound',
      waMessageId: input.waMessageId,
      identityId: null,
      userId: null,
      spaceId: null,
      messageType: input.type,
      status: 'received',
      content: input.content,
      intent: null,
      errorCode: null,
      correlationId: input.correlationId,
      transactionId: null,
      receivedAt: new Date().toISOString(),
      processedAt: null,
    })
    return { id, duplicate: false }
  }

  async updateInbound(id: UUID, patch: Parameters<WhatsAppStore['updateInbound']>[1]) {
    const m = this.db.messages.find((x) => x.id === id)
    if (!m) return
    if (patch.status) m.status = patch.status
    if (patch.identityId) m.identityId = patch.identityId
    if (patch.userId) m.userId = patch.userId
    if (patch.spaceId) m.spaceId = patch.spaceId
    if (patch.content !== undefined) m.content = patch.content
    if (patch.intent !== undefined) m.intent = patch.intent
    if (patch.errorCode !== undefined) m.errorCode = patch.errorCode
    if (patch.transactionId !== undefined) m.transactionId = patch.transactionId
    if (patch.status && patch.status !== 'processing') m.processedAt = new Date().toISOString()
  }

  async recordOutbound(input: Parameters<WhatsAppStore['recordOutbound']>[0]) {
    this.db.messages.push({
      id: randomUUID(),
      direction: 'outbound',
      waMessageId: input.waMessageId,
      identityId: input.identityId,
      userId: input.userId,
      spaceId: input.spaceId,
      messageType: 'text',
      status: 'sent',
      content: null,
      intent: null,
      errorCode: null,
      correlationId: input.correlationId,
      transactionId: input.transactionId,
      receivedAt: new Date().toISOString(),
      processedAt: null,
    })
  }

  async updateOutboundStatus(waMessageId: string, status: 'sent' | 'delivered' | 'read' | 'failed') {
    const m = this.db.messages.find((x) => x.direction === 'outbound' && x.waMessageId === waMessageId)
    if (m) m.status = status
  }

  async transactionForMessage(waMessageId: string, userId: UUID) {
    const m = this.db.messages.find((x) => x.waMessageId === waMessageId && x.userId === userId)
    return m?.transactionId ?? null
  }

  async unknownSenderRepliedSince() {
    return false
  }

  async findVerifiedIdentity(phones: string[]) {
    const identity = this.db.identities.find((i) => i.status === 'verified' && phones.includes(i.phoneE164))
    if (!identity) return null
    return {
      identityId: identity.id,
      userId: identity.userId,
      phoneE164: identity.phoneE164,
      defaultSpaceId: identity.defaultSpaceId,
      userName: this.db.profiles.get(identity.userId)?.fullName ?? 'você',
    }
  }

  async verifyLinkCode(phones: string[], code: string) {
    const identity = this.db.identities.find((i) => i.status === 'pending' && i.codeHash && phones.includes(i.phoneE164))
    if (!identity) return { status: 'not_found' as const }
    if (!identity.codeExpiresAt || new Date(identity.codeExpiresAt).getTime() < Date.now()) return { status: 'expired' as const, userId: identity.userId }
    if (identity.attempts >= 5) return { status: 'locked' as const, userId: identity.userId }
    if (identity.codeHash !== sha256(`${identity.id}:${code}`)) {
      identity.attempts += 1
      return { status: 'invalid' as const, userId: identity.userId }
    }
    if (this.db.identities.some((i) => i.phoneE164 === identity.phoneE164 && i.status === 'verified' && i.userId !== identity.userId)) {
      return { status: 'conflict' as const, userId: identity.userId }
    }
    identity.status = 'verified'
    identity.verifiedAt = new Date().toISOString()
    identity.codeHash = null
    return { status: 'verified' as const, userId: identity.userId }
  }

  async userName(userId: UUID) {
    return this.db.profiles.get(userId)?.fullName ?? 'você'
  }

  async snapshot(spaceId: UUID, userId: UUID) {
    const repo = new DemoRepository(this.db, userId)
    const space = await repo.getSpace(spaceId)
    if (!space) return null
    const [categories, groups, accounts, cards] = await Promise.all([repo.listCategories(spaceId), repo.listGroups(spaceId), repo.listAccounts(spaceId), repo.listCards(spaceId)])
    return {
      space,
      role: space.myRole,
      members: space.members.map((m) => ({ userId: m.userId, fullName: m.fullName })),
      categories,
      groups,
      accounts,
      cards,
    }
  }

  acting(spaceId: UUID, userId: UUID): ActingFinance {
    const repo = new DemoRepository(this.db, userId)
    const db = this.db
    return {
      createTransactions: (input) => repo.createTransaction(spaceId, input),
      getTransaction: (id) => repo.getTransaction(spaceId, id),
      recentlyCreated: async (sinceIso, limit) =>
        db.transactions
          .filter((t) => t.spaceId === spaceId && t.createdBy === userId && !t.deletedAt && t.createdAt >= sinceIso)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit),
      visibleSince: async (fromDate, limit) => (await repo.listTransactions(spaceId, { from: fromDate, pageSize: limit })).items,
      updateTransaction: (id, input) => repo.updateTransaction(spaceId, id, input),
      softDelete: async (id) => {
        const tx = await repo.getTransaction(spaceId, id)
        if (!tx || !canEditTransaction(tx, userId)) throw new AppError('FORBIDDEN')
        await repo.deleteTransaction(spaceId, id)
      },
      categoryTotals: (from, to) => repo.categoryTotals(spaceId, from, to),
      getPlan: (month) => repo.getPlan(spaceId, month),
    }
  }

  async getOpenAction(identityId: UUID): Promise<PendingAction | null> {
    const now = new Date().toISOString()
    const action = this.db.actions.find((a) => a.identityId === identityId && a.status === 'open')
    if (!action) return null
    if (action.expiresAt < now) {
      action.status = 'expired'
      return null
    }
    return { ...action, kind: action.kind as PendingAction['kind'] }
  }

  async saveAction(action: Parameters<WhatsAppStore['saveAction']>[0]) {
    for (const a of this.db.actions) if (a.identityId === action.identityId && a.status === 'open') a.status = 'cancelled'
    this.db.actions.push({
      id: randomUUID(),
      identityId: action.identityId,
      spaceId: action.spaceId,
      userId: action.userId,
      kind: action.kind,
      payload: action.payload,
      status: 'open',
      expiresAt: new Date(Date.now() + (action.ttlMinutes ?? 30) * 60_000).toISOString(),
      createdAt: new Date().toISOString(),
    })
  }

  async closeAction(id: UUID, status: 'resolved' | 'cancelled' | 'expired') {
    const a = this.db.actions.find((x) => x.id === id)
    if (a) a.status = status
  }

  async countAiUsageSince(spaceId: UUID, sinceIso: string) {
    return this.db.aiUsage.filter((u) => u.spaceId === spaceId && u.success && u.createdAt >= sinceIso && u.provider !== 'fixture').length
  }

  async logAiUsage(event: Parameters<WhatsAppStore['logAiUsage']>[0]) {
    this.db.aiUsage.push({ ...event, createdAt: new Date().toISOString() })
  }
}
