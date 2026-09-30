import type { MemberRole, Transaction, TransactionScope, TransactionVisibility, UUID } from './types'

/**
 * Authorization rules shared by server actions and mirrored by RLS policies
 * (supabase/migrations/*_rls.sql). The database is the security boundary; these helpers
 * give early, human-readable errors and drive what the UI offers.
 */

export type SpaceAction =
  | 'space.update'
  | 'space.delete'
  | 'members.invite'
  | 'members.remove'
  | 'categories.manage'
  | 'plan.edit'
  | 'transactions.create'
  | 'accounts.manage'
  | 'goals.manage'
  | 'recurring.manage'

const ADMIN_ONLY: ReadonlySet<SpaceAction> = new Set(['space.update', 'members.invite', 'members.remove'])
const OWNER_ONLY: ReadonlySet<SpaceAction> = new Set(['space.delete'])

export function canPerform(role: MemberRole | null | undefined, action: SpaceAction): boolean {
  if (!role) return false
  if (OWNER_ONLY.has(action)) return role === 'owner'
  if (ADMIN_ONLY.has(action)) return role === 'owner' || role === 'admin'
  return true
}

type TxPrivacy = Pick<Transaction, 'visibility' | 'memberId' | 'createdBy'>

/** Private personal transactions are visible only to their responsible member and creator. */
export function canViewTransaction(tx: TxPrivacy, viewerId: UUID): boolean {
  return tx.visibility === 'space' || tx.memberId === viewerId || tx.createdBy === viewerId
}

/**
 * Shared transactions: any active member edits. Personal transactions: only the responsible
 * member or whoever registered it — admins do not get to rewrite a partner's personal spending.
 */
export function canEditTransaction(tx: Pick<Transaction, 'scope' | 'memberId' | 'createdBy'> & TxPrivacy, viewerId: UUID): boolean {
  if (!canViewTransaction(tx, viewerId)) return false
  if (tx.scope === 'shared') return true
  return tx.memberId === viewerId || tx.createdBy === viewerId
}

/** Visibility is only meaningful for personal items; shared items are always space-visible. */
export function normalizeVisibility(scope: TransactionScope, visibility: TransactionVisibility): TransactionVisibility {
  return scope === 'shared' ? 'space' : visibility
}

export function canRemoveMember(actorRole: MemberRole, targetRole: MemberRole, actorId: UUID, targetId: UUID): boolean {
  if (actorId === targetId) return targetRole !== 'owner' // anyone but the owner may leave
  if (targetRole === 'owner') return false
  if (actorRole === 'owner') return true
  return actorRole === 'admin' && targetRole === 'member'
}

export function roleLabel(role: MemberRole): string {
  return role === 'owner' ? 'Titular' : role === 'admin' ? 'Administrador' : 'Membro'
}
