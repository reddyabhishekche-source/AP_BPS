const levels = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof levels;

const currentLevel: Level = (process.env.LOG_LEVEL as Level) ?? 'info';

function log(level: Level, message: string, meta?: unknown) {
  if (levels[level] > levels[currentLevel]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME ?? 'ap-bps',
    message,
    ...(meta ? { meta } : {}),
  };
  const output = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(output + '\n');
  else process.stdout.write(output + '\n');
}

export const logger = {
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
};
