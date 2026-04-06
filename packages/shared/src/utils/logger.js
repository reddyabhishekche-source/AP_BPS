"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = process.env.LOG_LEVEL ?? 'info';
function log(level, message, meta) {
    if (levels[level] > levels[currentLevel])
        return;
    const entry = {
        ts: new Date().toISOString(),
        level,
        service: process.env.SERVICE_NAME ?? 'ap-bps',
        message,
        ...(meta ? { meta } : {}),
    };
    const output = JSON.stringify(entry);
    if (level === 'error')
        process.stderr.write(output + '\n');
    else
        process.stdout.write(output + '\n');
}
exports.logger = {
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta),
};
//# sourceMappingURL=logger.js.map