import { z } from 'zod'
import { ConfigMissingError } from '@/lib/env'
import { logger } from '@/lib/observability/logger'

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'LIMIT_REACHED'
  | 'CONFIG_MISSING'
  | 'INTEGRATION'
  | 'INTERNAL'

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
  FORBIDDEN: 'Você não tem permissão para fazer isso neste espaço.',
  NOT_FOUND: 'Não encontramos o que você procurava.',
  VALIDATION: 'Revise os campos destacados.',
  CONFLICT: 'Essa operação conflita com dados existentes.',
  LIMIT_REACHED: 'Você atingiu o limite do seu plano para este recurso.',
  CONFIG_MISSING: 'Este recurso ainda não foi configurado.',
  INTEGRATION: 'Um serviço externo não respondeu como esperado. Tente novamente em instantes.',
  INTERNAL: 'Algo deu errado do nosso lado. Tente novamente.',
}

/** Typed domain/application error. `message` is always safe to show to the user. */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly fieldErrors?: Record<string, string>
  readonly cause?: unknown

  constructor(code: ErrorCode, message?: string, options?: { fieldErrors?: Record<string, string>; cause?: unknown }) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'AppError'
    this.code = code
    this.fieldErrors = options?.fieldErrors
    this.cause = options?.cause
  }
}

export interface ActionError {
  code: ErrorCode
  message: string
  fieldErrors?: Record<string, string>
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: ActionError }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form'
    if (!out[key]) out[key] = issue.message
  }
  return out
}

/** Converts anything thrown inside a server action into a user-safe result. Never leaks stack traces. */
export function toActionError(error: unknown, context?: string): { ok: false; error: ActionError } {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } }
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: { code: 'VALIDATION', message: DEFAULT_MESSAGES.VALIDATION, fieldErrors: zodFieldErrors(error) },
    }
  }
  if (error instanceof ConfigMissingError) {
    logger.warn('config.missing', { feature: error.feature, variables: error.variables })
    return { ok: false, error: { code: 'CONFIG_MISSING', message: `${error.feature} ainda não foi configurado.` } }
  }
  logger.error('action.failed', { context, error })
  return { ok: false, error: { code: 'INTERNAL', message: DEFAULT_MESSAGES.INTERNAL } }
}

export async function runAction<T>(context: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn())
  } catch (error) {
    // Next.js control-flow errors (redirect/notFound) must propagate.
    if (isNextControlFlow(error)) throw error
    return toActionError(error, context)
  }
}

function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false
  const digest = String((error as { digest: unknown }).digest)
  return digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK') || digest === 'NEXT_NOT_FOUND'
}
