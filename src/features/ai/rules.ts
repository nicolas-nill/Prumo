import { CATALOG_CATEGORIES } from '@/domain/catalog'
import { addDays, addMonthsToDate, parseBRDate } from '@/domain/dates'
import type { InterpretContext } from './provider'
import { EMPTY_INTERPRETATION, type Interpretation, type Question } from './schemas'

/**
 * Deterministic Portuguese interpreter for the common, well-formed messages
 * ("gastei 47,90 no almoço", "recebi 5000 de salário", "uber 23,50 ontem").
 * It runs first: when it is confident, no AI call is made (zero cost, zero latency).
 * When it is not, the LLM provider takes over — or, without one, the pipeline asks
 * the user to confirm. It never guesses silently.
 */

export const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const YES = /^(sim|s|isso|isso mesmo|confirmo|confirmar|pode|pode sim|ok|okay|certo|correto|beleza|blz|manda|pode registrar|registra)[.!]*$/
const NO = /^(nao|n|cancela|cancelar|errado|esquece|deixa|nao registra|para)[.!]*$/
const HELP = /^(ajuda|help|menu|comandos|como funciona|oi|ola|opa|bom dia|boa tarde|boa noite|e ai|eai|hey|hello)[!?.]*$/

const DELETE = /\b(apaga|apague|apagar|exclui|exclua|excluir|deleta|delete|deletar|remove|remova|remover|desfaz|desfazer)\b/
const CORRECT = /^(na verdade|corrige|corrija|corrigir|muda|mude|mudar|altera|altere|alterar|troca|troque|trocar|era|foi no|foi na|foi em|foi gasto|foi pelo|foi pela|nao foi|isso foi|coloca|coloque)\b/
const QUERY = /^(quanto|quanta|qual|quais|como (estou|estamos|esta|ta|to)|me (diz|fala|mostra)|resumo|saldo)\b/

const INCOME = /\b(recebi|recebemos|ganhei|ganhamos|entrou|entraram|caiu|cairam|salario|pix recebido|reembolso|reembolsaram|devolveram|rendeu|rendimento|vendi|freela|pagamento recebido)\b/
const EXPENSE = /\b(gastei|gastamos|gasto|paguei|pagamos|pago|comprei|compramos|custou|torrei|saiu|sairam|debitou|conta de|fatura)\b/

const MONEY =
  /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*(?:mil|k))?(?:\s*(?:reais|real|conto|contos|pila|pilas))?/g

const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }

const STOPWORDS = new Set([
  'gastei', 'gastamos', 'gasto', 'paguei', 'pagamos', 'pago', 'comprei', 'compramos', 'custou', 'foi', 'deu', 'recebi', 'recebemos', 'ganhei',
  'entrou', 'caiu', 'hoje', 'ontem', 'anteontem', 'reais', 'real', 'no', 'na', 'nos', 'nas', 'em', 'de', 'do', 'da', 'dos', 'das', 'com', 'um', 'uma',
  'o', 'a', 'os', 'as', 'pro', 'pra', 'para', 'por', 'pelo', 'pela', 'e', 'meu', 'minha', 'nosso', 'nossa', 'r$', 'cartao', 'credito', 'debito',
  'pix', 'dinheiro', 'vezes', 'x', 'parcelado', 'parcelada', 'a vista', 'dia', 'mil', 'k', 'conto', 'contos', 'so', 'mais', 'que', 'isso',
])

interface Money {
  text: string
  index: number
  length: number
}

function findMoney(normalized: string, original: string): { amount: Money | null; installments: number | null } {
  let installments: number | null = null
  const inst = /\b(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas)\b/.exec(normalized)
  if (inst) installments = Number(inst[1])

  const candidates: Money[] = []
  for (const m of normalized.matchAll(MONEY)) {
    const index = m.index ?? 0
    const before = normalized.slice(Math.max(0, index - 4), index)
    const after = normalized.slice(index + m[0].length, index + m[0].length + 2)
    // Skip dates (05/09), installment counts (12x), days ("dia 5") and hours ("14h").
    if (/\/$/.test(before) || /^\//.test(normalized.slice(index + m[1]!.length, index + m[1]!.length + 1))) continue
    if (inst && inst.index !== undefined && index >= inst.index && index < inst.index + inst[0].length) continue
    if (/dia\s*$/.test(before) || /^\s*(h|hs|min)\b/.test(after)) continue
    let text = original.slice(index, index + m[1]!.length).trim()
    if (m[2]) {
      // "2 mil" / "1,5 mil" → literal thousands text, still parsed deterministically downstream.
      const base = text.replace(',', '.')
      const value = Number(base) * 1000
      if (Number.isFinite(value)) text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',')
    }
    candidates.push({ text, index, length: m[0].length })
  }
  return { amount: candidates[0] ?? null, installments }
}

function resolveDate(normalized: string, today: string): string | null {
  if (/\banteontem\b/.test(normalized)) return addDays(today, -2)
  if (/\bontem\b/.test(normalized)) return addDays(today, -1)
  if (/\bhoje\b/.test(normalized)) return today
  const explicit = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/.exec(normalized)
  if (explicit) return parseBRDate(explicit[1]!, today)
  const day = /\bdia\s+(\d{1,2})\b/.exec(normalized)
  if (day) {
    const d = Number(day[1])
    if (d < 1 || d > 31) return null
    const monthStartDate = `${today.slice(0, 7)}-01`
    const candidate = addMonthsToDate(monthStartDate, 0, d)
    // "dia 28" said on the 5th means last month's 28th, never the future.
    return candidate > today ? addMonthsToDate(monthStartDate, -1, d) : candidate
  }
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}(-feira)?\\b`).test(normalized)) {
      const todayDow = new Date(`${today}T12:00:00Z`).getUTCDay()
      const diff = (todayDow - dow + 7) % 7 || 7
      return addDays(today, -diff)
    }
  }
  return null
}

interface CategoryMatch {
  key: string
  word: string
}

function matchCategory(normalized: string, context: InterpretContext): CategoryMatch | null {
  // 1. Custom/renamed categories of the space, by exact name.
  for (const c of context.categories) {
    const name = strip(c.name)
    if (name.length >= 3 && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized)) return { key: c.key, word: name }
  }
  // 2. Catalog hints (only for categories that exist in this space).
  const available = new Set(context.categories.map((c) => c.key))
  let best: CategoryMatch | null = null
  for (const c of CATALOG_CATEGORIES) {
    if (!available.has(c.key)) continue
    for (const hint of c.hints) {
      const h = strip(hint)
      if (new RegExp(`(^|\\s)${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$|[.,!?])`).test(normalized) && (!best || h.length > best.word.length)) {
        best = { key: c.key, word: h }
      }
    }
  }
  return best
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const NON_DESCRIPTIVE = /^(hoje|ontem|anteontem|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia|cartao|credito|debito|pix|dinheiro|vista)$/

function extractDescription(original: string, normalized: string, amount: Money | null): { description: string | null; merchant: string | null } {
  // Phrase after a preposition: "no Outback" (proper noun → merchant), "no mercado" (common noun).
  const prep = /\b(?:no|na|nos|nas|em|pelo|pela|com|de|do|da)\s+([a-z0-9'&-]+(?:\s+[a-z0-9'&-]+){0,2})/g
  for (const m of normalized.matchAll(prep)) {
    const phrase = m[1]!
    const kept: string[] = []
    for (const w of phrase.split(/\s+/)) {
      if (STOPWORDS.has(w) || /^\d/.test(w) || NON_DESCRIPTIVE.test(w)) break
      kept.push(w)
    }
    if (kept.length === 0) continue
    const start = (m.index ?? 0) + m[0].length - phrase.length
    const originalPhrase = original.slice(start, start + kept.join(' ').length).replace(/[.,!?]+$/, '')
    if (/^[A-ZÀ-Ú]/.test(originalPhrase)) return { description: originalPhrase, merchant: originalPhrase }
    return { description: titleCase(originalPhrase), merchant: null }
  }
  // Fallback: first meaningful word outside the amount ("uber 23,50" → Uber).
  const withoutAmount = amount ? normalized.slice(0, amount.index) + ' '.repeat(amount.length) + normalized.slice(amount.index + amount.length) : normalized
  const match = /[a-z][a-z'&-]+/g
  for (const m of withoutAmount.matchAll(match)) {
    const word = m[0]
    if (word.length < 2 || STOPWORDS.has(word) || NON_DESCRIPTIVE.test(word) || EXPENSE.test(word) || INCOME.test(word)) continue
    const originalWord = original.slice(m.index ?? 0, (m.index ?? 0) + word.length)
    return { description: titleCase(originalWord), merchant: /^[A-ZÀ-Ú]/.test(originalWord) ? originalWord : null }
  }
  return { description: null, merchant: null }
}

function findPayment(normalized: string, original: string, context: InterpretContext): string | null {
  for (const name of [...context.cards, ...context.accounts]) {
    if (strip(name).length >= 3 && normalized.includes(strip(name))) return name
  }
  const card = /\b(?:no|na|pelo)\s+cart[aã]o(?:\s+(?:do|da|de))?\s+([a-z0-9]+)/.exec(normalized)
  if (card?.[1] && !STOPWORDS.has(card[1])) {
    const idx = normalized.indexOf(card[1], card.index)
    return `cartão ${original.slice(idx, idx + card[1].length)}`
  }
  if (/\b(no\s+)?credito\b|\bcartao\b/.test(normalized)) return 'cartão'
  if (/\bpix\b/.test(normalized)) return 'pix'
  if (/\bdebito\b/.test(normalized)) return 'débito'
  if (/\b(dinheiro|especie|vivo)\b/.test(normalized)) return 'dinheiro'
  return null
}

function findScope(normalized: string): 'personal' | 'shared' | null {
  if (/\b(nosso|nossa|nossos|nossas|compartilhad[oa]|da casa|dos dois|juntos|do casal|gasto nosso)\b/.test(normalized)) return 'shared'
  if (/\b(pessoal|so meu|so minha|e meu|e minha|meu gasto|particular)\b/.test(normalized)) return 'personal'
  return null
}

function questionOf(normalized: string, hasCategory: boolean): Question {
  if (/\b(posso gastar|ainda posso|resta|sobra|sobrou|disponivel|falta gastar)\b/.test(normalized)) return 'remaining_budget'
  if (/\b(mais aumentou|mais gast|maior gasto|onde (mais )?gast)\b/.test(normalized)) return 'top_category'
  if (hasCategory) return 'spent_in_category'
  return 'month_summary'
}

export function interpretWithRules(text: string, context: InterpretContext): Interpretation {
  const original = text.trim().replace(/\s+/g, ' ')
  const normalized = strip(original)
  if (!normalized) return EMPTY_INTERPRETATION

  if (YES.test(normalized)) return { ...EMPTY_INTERPRETATION, operation: 'confirm_yes', confidence: 0.95 }
  if (NO.test(normalized)) return { ...EMPTY_INTERPRETATION, operation: 'confirm_no', confidence: 0.95 }
  if (HELP.test(normalized)) return { ...EMPTY_INTERPRETATION, operation: 'help', confidence: 0.95 }

  const category = matchCategory(normalized, context)
  const { amount, installments } = findMoney(normalized, original)
  const date = resolveDate(normalized, context.today)
  const paymentHint = findPayment(normalized, original, context)
  const scope = findScope(normalized)

  if (QUERY.test(normalized) && !EXPENSE.test(normalized.split(' ').slice(0, 1).join(' '))) {
    return { ...EMPTY_INTERPRETATION, operation: 'query', question: questionOf(normalized, Boolean(category)), categoryKey: category?.key ?? null, date, confidence: 0.85 }
  }

  if (DELETE.test(normalized)) {
    const target = normalized.replace(DELETE, '').replace(/\b(o|a|os|as|esse|essa|isso|ultimo|ultima|lancamento|gasto|registro)\b/g, ' ').replace(/\s+/g, ' ').trim()
    return {
      ...EMPTY_INTERPRETATION,
      operation: 'delete_transaction',
      targetHint: /\b(ultimo|ultima|isso|esse|essa)\b/.test(normalized) && !target ? 'último' : target || 'último',
      date,
      amountText: amount?.text ?? null,
      categoryKey: category?.key ?? null,
      confidence: 0.8,
    }
  }

  if (CORRECT.test(normalized) || (!amount && (paymentHint || scope) && /^(foi|era|e)\b/.test(normalized))) {
    return {
      ...EMPTY_INTERPRETATION,
      operation: 'correct_last',
      amountText: amount?.text ?? null,
      categoryKey: category?.key ?? null,
      paymentHint,
      scope,
      date,
      installments,
      targetHint: 'último',
      confidence: amount || category || paymentHint || scope || date ? 0.85 : 0.4,
    }
  }

  if (!amount) {
    return { ...EMPTY_INTERPRETATION, operation: 'unknown', confidence: 0.2 }
  }

  const isIncome = INCOME.test(normalized) || context.categories.some((c) => c.kind === 'income' && c.key === category?.key)
  const isExpense = EXPENSE.test(normalized)
  const transactionType = isIncome && !isExpense ? 'income' : 'expense'
  const incomeCategory = transactionType === 'income' ? (category && context.categories.find((c) => c.key === category.key)?.kind === 'income' ? category.key : /salario/.test(normalized) ? 'salary' : null) : null
  const { description, merchant } = extractDescription(original, normalized, amount)

  let confidence = 0.55
  if (isIncome || isExpense) confidence += 0.15
  if (transactionType === 'expense' ? category : incomeCategory) confidence += 0.2
  if (description) confidence += 0.05

  return {
    ...EMPTY_INTERPRETATION,
    operation: 'create_transaction',
    transactionType,
    amountText: amount.text,
    date,
    description: description ?? (category ? context.categories.find((c) => c.key === category.key)?.name ?? null : null),
    merchant,
    categoryKey: transactionType === 'income' ? incomeCategory : (category?.key ?? null),
    paymentHint,
    installments: installments && installments > 1 ? installments : null,
    scope,
    confidence: Math.min(confidence, 0.95),
  }
}
