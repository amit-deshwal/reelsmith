// Reelsmith: the renderer's warnings and errors go to <userData>/logs/renderer.log, so a failure only the DevTools console
// saw (a fast export that threw, a mask model that did not load) can be read after the fact without a debugging port.
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { WebContents } from 'electron';

const MAX_BYTES = 2 * 1024 * 1024;

type ConsoleLevel = 'debug' | 'info' | 'warning' | 'error';

/** Electron 35+ passes one event with level/message; older builds passed (event, level number, message, line, source). */
export function consoleEntry(args: readonly unknown[]): { level: ConsoleLevel; message: string; source: string } | null {
  const [first, levelArg, messageArg, lineArg, sourceArg] = args as [Record<string, unknown> | undefined, unknown, unknown, unknown, unknown];
  if (first && typeof first.message === 'string' && typeof first.level === 'string') {
    const line = typeof first.lineNumber === 'number' ? `:${first.lineNumber}` : '';
    return { level: first.level as ConsoleLevel, message: first.message, source: `${String(first.sourceId ?? '')}${line}` };
  }
  if (typeof levelArg === 'number' && typeof messageArg === 'string') {
    const level = (['debug', 'info', 'warning', 'error'] as const)[levelArg] ?? 'info';
    return { level, message: messageArg, source: `${String(sourceArg ?? '')}:${String(lineArg ?? '')}` };
  }
  return null;
}

export function formatLogLine(entry: { level: ConsoleLevel; message: string; source: string }, at = new Date()): string {
  return `${at.toISOString()} ${entry.level.toUpperCase()} ${entry.message.replace(/\s+$/, '')}${entry.source ? `  (${entry.source})` : ''}\n`;
}

export function installRendererConsoleLog(contents: WebContents, logDir: string): void {
  const file = join(logDir, 'renderer.log');
  let chain: Promise<void> = mkdir(logDir, { recursive: true }).then(() => undefined, () => undefined);
  contents.on('console-message', (...args: unknown[]) => {
    const entry = consoleEntry(args);
    if (!entry || (entry.level !== 'warning' && entry.level !== 'error')) return;
    const line = formatLogLine(entry);
    chain = chain.then(async () => {
      try {
        const size = await stat(file).then((s) => s.size, () => 0);
        if (size > MAX_BYTES) await rename(file, `${file}.1`);
        await appendFile(file, line);
      } catch { /* logging must never break the app */ }
    });
  });
}
