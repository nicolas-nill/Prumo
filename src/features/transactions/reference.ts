import type { Account, Card, Category, CategoryGroup, ISODate, Transaction, TransactionView } from '@/domain/types'

/** Serializable data the transaction form and lists need from the active space. */
export interface TransactionReference {
  viewerId: string
  today: ISODate
  spaceType: 'personal' | 'shared'
  groups: CategoryGroup[]
  categories: Category[]
  accounts: Account[]
  cards: Card[]
  members: { id: string; name: string }[]
}

/** Enriches transactions with names in memory — constant number of queries, no N+1. */
export function toViews(transactions: Transaction[], ref: Pick<TransactionReference, 'categories' | 'accounts' | 'cards' | 'members' | 'groups'>): TransactionView[] {
  const categories = new Map(ref.categories.map((c) => [c.id, c]))
  const groups = new Map(ref.groups.map((g) => [g.id, g]))
  const accounts = new Map(ref.accounts.map((a) => [a.id, a]))
  const cards = new Map(ref.cards.map((c) => [c.id, c]))
  const members = new Map(ref.members.map((m) => [m.id, m]))
  return transactions.map((t) => {
    const category = t.categoryId ? categories.get(t.categoryId) : undefined
    const tone = category?.tone ?? (category?.groupId ? groups.get(category.groupId)?.tone : undefined) ?? (t.type === 'income' ? 'sage' : 'slate')
    const account = t.accountId ? accounts.get(t.accountId) : undefined
    const card = t.cardId ? cards.get(t.cardId) : undefined
    const member = members.get(t.memberId)
    return {
      ...t,
      category: category ? { id: category.id, name: category.name, tone, icon: category.icon, groupId: category.groupId, kind: category.kind } : null,
      account: account ? { id: account.id, name: account.name } : null,
      card: card ? { id: card.id, name: card.name, lastFour: card.lastFour } : null,
      member: member ? { id: member.id, fullName: member.name } : null,
    }
  })
}
