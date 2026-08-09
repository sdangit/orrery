// Incrementally reads whatever bytes were appended to a journal file since
// the last check. The game writes the journal continuously while running, so
// a read can land mid-line — the trailing partial line is held back as
// `remainder` and prepended to the next read, rather than parsed (and
// potentially dropped as invalid JSON) prematurely.

import { closeSync, openSync, readSync, statSync } from 'node:fs';

/**
 * @param {string} filePath
 * @param {number} previousOffset Byte offset already consumed (0 on first read).
 * @param {string} [previousRemainder] Partial trailing line held back from the previous read.
 * @returns {{ lines: string[], newOffset: number, remainder: string }}
 */
export function readNewLines(filePath, previousOffset, previousRemainder = '') {
  const { size } = statSync(filePath);

  if (size < previousOffset) {
    // The file is shorter than what we've already read — it was truncated or
    // replaced out from under us. Safest recovery is to start over.
    return readNewLines(filePath, 0, '');
  }
  if (size === previousOffset) {
    return { lines: [], newOffset: previousOffset, remainder: previousRemainder };
  }

  const length = size - previousOffset;
  const buffer = Buffer.alloc(length);
  const fd = openSync(filePath, 'r');
  try {
    readSync(fd, buffer, 0, length, previousOffset);
  } finally {
    closeSync(fd);
  }

  const text = previousRemainder + buffer.toString('utf8');
  const parts = text.split(/\r?\n/);
  const remainder = parts.pop() ?? '';
  const lines = parts.filter((line) => line.length > 0);

  return { lines, newOffset: size, remainder };
}
