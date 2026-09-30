import type { CategoryKind, GroupKey, Tone } from './types'

/**
 * Default groups and categories created for every new space. Mirrored by
 * public.seed_space_defaults() in supabase/migrations/*_functions.sql — tests/db asserts both agree.
 *
 * `key` is a stable system key: renaming "Mercado" to "Supermercado" keeps key = groceries,
 * so interpreters and rules keep mapping correctly.
 */

export interface CatalogGroup {
  key: GroupKey
  name: string
  tone: Tone
  isSavings: boolean
  sortOrder: number
}

export interface CatalogCategory {
  key: string
  name: string
  kind: CategoryKind
  group: GroupKey | null
  icon: string
  sortOrder: number
  /** Selected by default in onboarding. */
  defaultOn: boolean
  /** Always created (cannot be deselected in onboarding). */
  required?: boolean
  /** Words that strongly suggest this category in free text (rule-based interpreter). */
  hints: string[]
}

export const CATALOG_GROUPS: CatalogGroup[] = [
  { key: 'essentials', name: 'Necessidades', tone: 'blue', isSavings: false, sortOrder: 1 },
  { key: 'lifestyle', name: 'Viver', tone: 'rose', isSavings: false, sortOrder: 2 },
  { key: 'savings', name: 'Investimentos', tone: 'lilac', isSavings: true, sortOrder: 3 },
]

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  // Necessidades
  { key: 'housing', name: 'Moradia', kind: 'expense', group: 'essentials', icon: 'home', sortOrder: 1, defaultOn: true, hints: ['aluguel', 'condominio', 'condomínio', 'iptu', 'financiamento', 'prestacao do ape', 'reforma'] },
  { key: 'groceries', name: 'Mercado', kind: 'expense', group: 'essentials', icon: 'shopping-cart', sortOrder: 2, defaultOn: true, hints: ['mercado', 'supermercado', 'feira', 'hortifruti', 'padaria', 'açougue', 'acougue', 'atacadão', 'atacadao', 'assaí', 'assai', 'carrefour', 'pão de açúcar', 'pao de acucar'] },
  { key: 'utilities', name: 'Contas da casa', kind: 'expense', group: 'essentials', icon: 'plug', sortOrder: 3, defaultOn: true, hints: ['luz', 'energia', 'água', 'agua', 'gás', 'gas', 'internet', 'celular', 'telefone', 'enel', 'sabesp', 'vivo', 'claro', 'tim'] },
  { key: 'transport', name: 'Transporte', kind: 'expense', group: 'essentials', icon: 'car', sortOrder: 4, defaultOn: true, hints: ['uber', '99', 'taxi', 'táxi', 'ônibus', 'onibus', 'metrô', 'metro', 'combustível', 'combustivel', 'gasolina', 'etanol', 'posto', 'estacionamento', 'pedágio', 'pedagio', 'ipva', 'oficina'] },
  { key: 'health', name: 'Saúde', kind: 'expense', group: 'essentials', icon: 'heart-pulse', sortOrder: 5, defaultOn: true, hints: ['farmácia', 'farmacia', 'remédio', 'remedio', 'drogasil', 'droga raia', 'médico', 'medico', 'consulta', 'exame', 'dentista', 'plano de saúde', 'plano de saude', 'terapia'] },
  { key: 'education', name: 'Educação', kind: 'expense', group: 'essentials', icon: 'graduation-cap', sortOrder: 6, defaultOn: true, hints: ['escola', 'faculdade', 'curso', 'livro', 'mensalidade escolar'] },
  { key: 'kids', name: 'Filhos', kind: 'expense', group: 'essentials', icon: 'baby', sortOrder: 7, defaultOn: false, hints: ['fralda', 'creche', 'babá', 'baba'] },
  { key: 'pets', name: 'Pets', kind: 'expense', group: 'essentials', icon: 'paw-print', sortOrder: 8, defaultOn: false, hints: ['ração', 'racao', 'veterinário', 'veterinario', 'petshop', 'pet shop'] },
  // Viver
  { key: 'restaurants', name: 'Restaurantes', kind: 'expense', group: 'lifestyle', icon: 'utensils', sortOrder: 1, defaultOn: true, hints: ['almoço', 'almoco', 'jantar', 'restaurante', 'lanche', 'ifood', 'pizza', 'hamburguer', 'hambúrguer', 'café', 'cafe', 'bar', 'outback', 'delivery', 'sushi'] },
  { key: 'leisure', name: 'Lazer', kind: 'expense', group: 'lifestyle', icon: 'ticket', sortOrder: 2, defaultOn: true, hints: ['cinema', 'show', 'ingresso', 'teatro', 'parque', 'passeio', 'festa', 'balada'] },
  { key: 'shopping', name: 'Compras', kind: 'expense', group: 'lifestyle', icon: 'shopping-bag', sortOrder: 3, defaultOn: true, hints: ['roupa', 'sapato', 'tênis', 'tenis', 'shopping', 'amazon', 'mercado livre', 'shein', 'loja', 'presente'] },
  { key: 'subscriptions', name: 'Assinaturas', kind: 'expense', group: 'lifestyle', icon: 'repeat', sortOrder: 4, defaultOn: true, hints: ['netflix', 'spotify', 'assinatura', 'prime video', 'disney', 'hbo', 'max', 'youtube premium', 'icloud', 'academia', 'smartfit', 'gympass', 'wellhub'] },
  { key: 'personal_care', name: 'Cuidados pessoais', kind: 'expense', group: 'lifestyle', icon: 'sparkles', sortOrder: 5, defaultOn: true, hints: ['cabelo', 'salão', 'salao', 'barbeiro', 'manicure', 'cosmético', 'cosmetico', 'perfume'] },
  { key: 'travel', name: 'Viagens', kind: 'expense', group: 'lifestyle', icon: 'plane', sortOrder: 6, defaultOn: true, hints: ['viagem', 'hotel', 'passagem', 'airbnb', 'hospedagem', 'voo'] },
  { key: 'gifts', name: 'Presentes', kind: 'expense', group: 'lifestyle', icon: 'gift', sortOrder: 7, defaultOn: false, hints: ['presente', 'aniversário', 'aniversario'] },
  // Investimentos
  { key: 'investments', name: 'Investimentos', kind: 'expense', group: 'savings', icon: 'trending-up', sortOrder: 1, defaultOn: true, required: true, hints: ['investi', 'investimento', 'aporte', 'tesouro', 'cdb', 'ações', 'acoes', 'previdência', 'previdencia'] },
  { key: 'emergency_fund', name: 'Reserva de emergência', kind: 'expense', group: 'savings', icon: 'shield', sortOrder: 2, defaultOn: true, hints: ['reserva', 'poupança', 'poupanca', 'guardei'] },
  // Sem grupo
  { key: 'other', name: 'Outros', kind: 'expense', group: null, icon: 'circle-dashed', sortOrder: 99, defaultOn: true, required: true, hints: [] },
  // Receitas
  { key: 'salary', name: 'Salário', kind: 'income', group: null, icon: 'briefcase', sortOrder: 1, defaultOn: true, required: true, hints: ['salário', 'salario', 'pagamento', 'holerite', 'pró-labore', 'pro-labore'] },
  { key: 'extra_income', name: 'Renda extra', kind: 'income', group: null, icon: 'hand-coins', sortOrder: 2, defaultOn: true, required: true, hints: ['freela', 'freelance', 'bico', 'venda', 'vendi', 'comissão', 'comissao'] },
  { key: 'yields', name: 'Rendimentos', kind: 'income', group: null, icon: 'piggy-bank', sortOrder: 3, defaultOn: true, required: true, hints: ['rendimento', 'dividendo', 'juros'] },
  { key: 'refunds', name: 'Reembolsos', kind: 'income', group: null, icon: 'rotate-ccw', sortOrder: 4, defaultOn: true, required: true, hints: ['reembolso', 'estorno', 'devolução', 'devolucao', 'cashback'] },
  { key: 'other_income', name: 'Outras receitas', kind: 'income', group: null, icon: 'plus-circle', sortOrder: 5, defaultOn: true, required: true, hints: ['pix recebido', 'recebi'] },
]

export const SELECTABLE_EXPENSE_CATEGORIES = CATALOG_CATEGORIES.filter((c) => c.kind === 'expense' && !c.required)

export function defaultCategoryKeys(): string[] {
  return CATALOG_CATEGORIES.filter((c) => c.defaultOn).map((c) => c.key)
}

export function catalogCategory(key: string): CatalogCategory | undefined {
  return CATALOG_CATEGORIES.find((c) => c.key === key)
}
