/**
 * Structured logger for production observability.
 * Outputs JSON in production, human-readable in development.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info']
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  if (IS_PRODUCTION) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    })
  }

  const timestamp = new Date().toISOString().split('T')[1]?.replace('Z', '') ?? ''
  const prefix = `[${timestamp}] [${level.toUpperCase().padEnd(5)}]`
  const ctxStr = context && Object.keys(context).length > 0
    ? ` ${JSON.stringify(context)}`
    : ''
  return `${prefix} ${message}${ctxStr}`
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= MIN_LEVEL
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, context))
  },

  info(message: string, context?: LogContext) {
    if (shouldLog('info')) console.info(formatMessage('info', message, context))
  },

  warn(message: string, context?: LogContext) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, context))
  },

  error(message: string, context?: LogContext) {
    if (shouldLog('error')) console.error(formatMessage('error', message, context))
  },

  /** Create a child logger with default context fields */
  child(defaultContext: LogContext) {
    return {
      debug: (msg: string, ctx?: LogContext) => logger.debug(msg, { ...defaultContext, ...ctx }),
      info: (msg: string, ctx?: LogContext) => logger.info(msg, { ...defaultContext, ...ctx }),
      warn: (msg: string, ctx?: LogContext) => logger.warn(msg, { ...defaultContext, ...ctx }),
      error: (msg: string, ctx?: LogContext) => logger.error(msg, { ...defaultContext, ...ctx }),
    }
  },
}
