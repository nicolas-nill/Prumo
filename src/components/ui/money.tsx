import { formatMoney, type FormatMoneyOptions } from '@/domain/money'
import { cn } from '@/lib/utils/cn'

interface MoneyProps extends FormatMoneyOptions {
  cents: number
  className?: string
  /** Color by meaning: income green, expense default. Never decorative. */
  tone?: 'income' | 'expense' | 'neutral' | 'auto'
}

export function Money({ cents, className, tone = 'neutral', ...options }: MoneyProps) {
  const color =
    tone === 'income' ? 'text-success' : tone === 'auto' ? (cents < 0 ? 'text-danger' : cents > 0 ? 'text-success' : '') : ''
  return <span className={cn('text-money whitespace-nowrap', color, className)}>{formatMoney(cents, options)}</span>
}
