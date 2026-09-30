import { AppError, type ErrorCode } from '@/lib/errors'

interface PostgrestLikeError {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

const PRUMO_CODES: Record<string, { code: ErrorCode; message?: string }> = {
  PRUMO_UNAUTHENTICATED: { code: 'UNAUTHENTICATED' },
  PRUMO_FORBIDDEN: { code: 'FORBIDDEN' },
  PRUMO_NOT_FOUND: { code: 'NOT_FOUND' },
  PRUMO_INVALID: { code: 'VALIDATION', message: 'Não foi possível concluir: dados inválidos.' },
  PRUMO_CONFLICT: { code: 'CONFLICT' },
  PRUMO_LIMIT_REACHED: { code: 'LIMIT_REACHED' },
  PRUMO_EXPIRED: { code: 'VALIDATION', message: 'Este convite expirou. Peça um novo link.' },
  PRUMO_EMAIL_MISMATCH: {
    code: 'FORBIDDEN',
    message: 'Este convite foi enviado para outro e-mail. Entre com a conta convidada.',
  },
}

/** Maps database/PostgREST errors to typed, user-safe AppErrors. */
export function mapDbError(error: PostgrestLikeError, context: string): AppError {
  const prefix = /^(PRUMO_[A-Z_]+)/.exec(error.message)?.[1]
  if (prefix && PRUMO_CODES[prefix]) {
    const mapped = PRUMO_CODES[prefix]!
    return new AppError(mapped.code, mapped.message, { cause: { context, ...error } })
  }
  switch (error.code) {
    case '23505':
      return new AppError('CONFLICT', 'Esse registro já existe.', { cause: { context, ...error } })
    case '23503':
      return new AppError('VALIDATION', 'Uma referência escolhida não pertence a este espaço.', { cause: { context, ...error } })
    case '23514':
      return new AppError('VALIDATION', undefined, { cause: { context, ...error } })
    case '42501':
      return new AppError('FORBIDDEN', undefined, { cause: { context, ...error } })
    case 'PGRST116':
      return new AppError('NOT_FOUND', undefined, { cause: { context, ...error } })
    default:
      return new AppError('INTERNAL', undefined, { cause: { context, ...error } })
  }
}

export function unwrap<T>(result: { data: T; error: PostgrestLikeError | null }, context: string): NonNullable<T> {
  if (result.error) throw mapDbError(result.error, context)
  if (result.data === null || result.data === undefined) throw new AppError('NOT_FOUND', undefined, { cause: { context } })
  return result.data as NonNullable<T>
}

export function check(result: { error: PostgrestLikeError | null }, context: string): void {
  if (result.error) throw mapDbError(result.error, context)
}
