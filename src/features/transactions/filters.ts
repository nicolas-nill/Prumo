import { isISODate, monthEnd, monthStart } from '@/domain/dates'
import type { MonthKey } from '@/domain/types'
import type { TransactionQuery } from '@/server/data/contracts'

type Params = Record<string, string | string[] | undefined>

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** URL → validated query. Anything malformed is ignored rather than trusted. */
export function parseTransactionFilters(params: Params, month: MonthKey): { query: TransactionQuery; active: number; customRange: boolean } {
  const from = str(params.de)
  const to = str(params.ate)
  const customRange = Boolean(from && to && isISODate(from) && isISODate(to) && from <= to)
  const type = str(params.tipo)
  const scope = str(params.escopo)
  const source = str(params.origem)
  const sort = str(params.ordem)
  const uuid = (v: string | undefined) => (v && UUID.test(v) ? v : undefined)
  const categoryRaw = str(params.categoria)

  const query: TransactionQuery = {
    from: customRange ? from : monthStart(month),
    to: customRange ? to : monthEnd(month),
    type: type === 'income' || type === 'expense' ? type : undefined,
    categoryId: categoryRaw === 'none' ? 'none' : uuid(categoryRaw),
    memberId: uuid(str(params.pessoa)),
    scope: scope === 'personal' || scope === 'shared' ? scope : undefined,
    accountId: uuid(str(params.conta)),
    cardId: uuid(str(params.cartao)),
    source: source === 'whatsapp' || source === 'dashboard' || source === 'recurring' || source === 'import' ? source : undefined,
    search: str(params.busca)?.slice(0, 60),
    sort: sort === 'date_asc' || sort === 'amount_desc' || sort === 'amount_asc' ? sort : 'date_desc',
    page: Math.max(1, Number(str(params.pagina) ?? 1) || 1),
    pageSize: 30,
  }
  const active = [query.type, query.categoryId, query.memberId, query.scope, query.accountId, query.cardId, query.source, query.search].filter(Boolean).length
  return { query, active, customRange }
}
