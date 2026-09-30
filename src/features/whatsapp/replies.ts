import { formatDateBR, formatDateShort, monthName } from '@/domain/dates'
import { formatMoney, formatPercent } from '@/domain/money'

/** Every message PRUMO sends on WhatsApp, in one place (pt-BR, concise, human). */
export const REPLIES = {
  unknownSender: (appUrl: string) =>
    `Olá! Aqui é o PRUMO. Este número ainda não está conectado a uma conta.\n\nPara registrar gastos por aqui, entre em ${appUrl}/whatsapp e conecte seu WhatsApp.`,
  linkVerified: (name: string) => `Pronto, ${name.split(' ')[0]}! Seu WhatsApp está conectado ao PRUMO.\n\nÉ só mandar, por exemplo: “gastei 35 no almoço”.`,
  linkInvalid: 'Esse código não confere. Confira no app e mande de novo: PRUMO 123456',
  linkExpired: 'Esse código expirou. Gere um novo em Configurações → WhatsApp no app.',
  linkLocked: 'Muitas tentativas com código errado. Gere um novo código no app.',
  linkConflict: 'Este número já está conectado a outra conta do PRUMO.',
  linkNotFound: 'Não encontrei um pedido de conexão para este número. Gere o código no app, em WhatsApp.',
  noSpace: (appUrl: string) => `Não encontrei um espaço ativo para este número. Abra ${appUrl}/whatsapp para escolher onde registrar.`,
  failure: 'Tive um problema para registrar agora. Tente de novo em instantes — nada foi salvo pela metade.',
  help: [
    'Você pode me mandar, por exemplo:',
    '• gastei 47,90 no almoço',
    '• paguei 320 no mercado ontem no cartão Nubank',
    '• recebi 5.000 de salário',
    '• comprei um notebook de 2.400 em 10x',
    '• na verdade foram 42 (corrige o último)',
    '• apaga o último',
    '• quanto ainda posso gastar?',
    '',
    'Também entendo áudio e foto de comprovante.',
  ].join('\n'),
  unknown: 'Não entendi. Tente algo como “gastei 35 no almoço” ou “quanto gastei com mercado?”. Mande “ajuda” para ver mais exemplos.',
  needAmount: 'Qual foi o valor? Por exemplo: “gastei 35 no almoço”.',
  unsupported: 'Por enquanto entendo texto, áudio e foto de comprovante.',
  documentNotSupported: 'Por enquanto leio fotos de comprovante, não arquivos. Pode mandar uma foto ou escrever o valor?',
  mediaUnavailable: 'Ainda não consigo processar esse tipo de mensagem por aqui. Pode escrever? Ex.: “gastei 80 na farmácia”.',
  aiLimit: 'Você chegou ao limite de mensagens por áudio e foto do seu plano neste mês. Mensagens de texto continuam funcionando.',
  notReceipt: 'Não parece um comprovante. Se for um gasto, me conta em texto: “gastei 50 no mercado”.',
  receiptUnreadable: 'Não consegui ler o valor total dessa foto. Pode me dizer em texto?',
  nothingPending: 'Não tenho nada aguardando confirmação agora.',
  cancelled: 'Tudo bem, não registrei.',
  nothingToCorrect: 'Não encontrei um registro recente seu para corrigir. As correções valem para o que você mandou nas últimas 2 horas.',
  correctionEmpty: 'O que você quer mudar? Ex.: “na verdade foram 42”, “foi no cartão Nubank”, “muda para mercado”.',
  deleteNotFound: 'Não encontrei esse lançamento nos últimos 7 dias. Se preferir, apague pelo app em Movimentações.',
  deleteTooMany: 'Encontrei vários lançamentos parecidos. Pode ser mais específico? Ex.: “apaga o Uber de 23,50 de ontem”.',
  deleted: (label: string) => `Apaguei ${label}.`,
  chooseCandidate: 'Qual deles devo apagar?',
  confirmDelete: (label: string) => `Apagar ${label}?`,
  duplicate: 'Esse lançamento já estava registrado.',

  registered: (amount: number, category: string | null, extra: string | null) =>
    `Registrei ${formatMoney(amount)}${category ? ` em ${category}` : ''}.${extra ? `\n${extra}` : ''}`,
  registeredInstallments: (total: number, count: number, per: number, category: string | null) =>
    `Registrei ${formatMoney(total)} em ${count}x de ${formatMoney(per)}${category ? ` em ${category}` : ''}.`,
  confirmCreate: (summary: string, heard: string | null) => `${heard ? `Entendi: “${heard}”\n\n` : ''}${summary}\n\nConfirma?`,
  chooseCategory: (summary: string) => `${summary}\n\nEm qual categoria?`,
  corrected: (summary: string) => `Pronto, atualizei: ${summary}.`,

  pace: (category: string, consumed: number, elapsed: number) =>
    `Você já usou ${formatPercent(consumed)} do orçamento de ${category} com ${formatPercent(elapsed)} do mês.`,
  monthSummary: (month: string, income: number, expense: number, result: number) =>
    `${monthName(month, { capitalized: true })} até agora:\nReceitas ${formatMoney(income)}\nDespesas ${formatMoney(expense)}\nResultado ${formatMoney(result)}`,
  categorySpent: (category: string, month: string, total: number, count: number, planned: number | null) =>
    `${category} em ${monthName(month)}: ${formatMoney(total)} em ${count} ${count === 1 ? 'lançamento' : 'lançamentos'}${planned ? ` (${formatPercent(total / planned)} do planejado)` : ''}.`,
  remaining: (available: number, perDay: number | null) =>
    available >= 0
      ? `Você ainda pode gastar ${formatMoney(available)} este mês${perDay !== null ? ` — cerca de ${formatMoney(perDay)} por dia` : ''}.`
      : `O mês já passou ${formatMoney(-available)} do planejado.`,
  remainingNoPlan: 'Ainda não há planejamento para este mês. Monte o seu no app para eu calcular quanto dá para gastar.',
  topIncrease: (category: string, delta: number, month: string) => `${category} foi a que mais aumentou: ${formatMoney(delta)} a mais que no mesmo período de ${monthName(month)}.`,
  noIncrease: 'Nenhuma categoria aumentou em relação ao mesmo período do mês passado.',

  summaryLine: (p: { amountCents: number; type: 'income' | 'expense'; category: string | null; description: string; date: string; today: string; payment: string | null; installments: number | null }) =>
    [
      `${p.type === 'income' ? 'Receita' : 'Gasto'} de ${formatMoney(p.amountCents)}${p.installments && p.installments > 1 ? ` em ${p.installments}x` : ''}`,
      p.description,
      p.category ?? 'sem categoria',
      p.date === p.today ? 'hoje' : `${formatDateShort(p.date, p.today).toLowerCase()} (${formatDateBR(p.date).slice(0, 5)})`,
      p.payment,
    ]
      .filter(Boolean)
      .join(' · '),
}
