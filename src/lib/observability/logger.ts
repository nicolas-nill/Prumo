/**
 * Minimal structured logger. JSON lines in production (ingestible by Vercel/Datadog/etc.),
 * compact lines in development. Sensitive keys are redacted before anything is written:
 * financial values, message content and personal identifiers never reach the logs.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const REDACTED_KEYS = new Set([
  'phone',
  'phone_e164',
  'wa_id',
  'from',
  'to',
  'text',
  'body',
  'content',
  'caption',
  'transcript',
  'email',
  'token',
  'access_token',
  'authorization',
  'password',
  'secret',
  'amount',
  'amount_cents',
  'amountcents',
  'description',
  'merchant',
  'notes',
  'code',
])

const MAX_DEPTH = 4

function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth > MAX_DEPTH) return '[depth]'
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: process.env.NODE_ENV === 'production' ? undefined : value.stack }
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(inner, depth + 1)
  }
  return out
}

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? '').toLowerCase() as Level
  if (configured in LEVELS) return LEVELS[configured]
  if (process.env.NODE_ENV === 'test') return LEVELS.warn
  return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug
}

function write(level: Level, event: string, fields: Fields) {
  if (LEVELS[level] < threshold()) return
  const safe = redact(fields) as Fields
  const line =
    process.env.NODE_ENV === 'production'
      ? JSON.stringify({ level, event, time: new Date().toISOString(), ...safe })
      : `[${level}] ${event} ${Object.keys(safe).length ? JSON.stringify(safe) : ''}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export interface Logger {
  debug(event: string, fields?: Fields): void
  info(event: string, fields?: Fields): void
  warn(event: string, fields?: Fields): void
  error(event: string, fields?: Fields): void
  child(bindings: Fields): Logger
}

function createLogger(bindings: Fields = {}): Logger {
  return {
    debug: (event, fields = {}) => write('debug', event, { ...bindings, ...fields }),
    info: (event, fields = {}) => write('info', event, { ...bindings, ...fields }),
    warn: (event, fields = {}) => write('warn', event, { ...bindings, ...fields }),
    error: (event, fields = {}) => write('error', event, { ...bindings, ...fields }),
    child: (more) => createLogger({ ...bindings, ...more }),
  }
}

export const logger = createLogger()

/** "+5511987654321" → "+55******4321". Safe to log when a phone hint is genuinely useful. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'unknown'
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return '****'
  return `+${digits.slice(0, 2)}${'*'.repeat(Math.max(0, digits.length - 6))}${digits.slice(-4)}`
}

export const __test__ = { redact }
