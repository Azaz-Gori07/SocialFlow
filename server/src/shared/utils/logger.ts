import { env } from '../config/env.config';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const configured = env?.isProduction ? 'info' : 'debug';
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configured]) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta } : {}),
  };

  if (level === 'error') {
    console.error(JSON.stringify(line));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(line));
  } else {
    console.log(JSON.stringify(line));
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};

export default logger;
