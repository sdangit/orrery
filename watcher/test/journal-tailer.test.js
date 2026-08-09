import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNewLines } from '../src/journal-tailer.js';

function withTempFile(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'orrery-journal-tailer-'));
  const filePath = join(dir, 'Journal.test.log');
  try {
    return fn(filePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('reads every complete line on a fresh file starting from offset 0', () => {
  withTempFile((filePath) => {
    writeFileSync(filePath, '{"a":1}\n{"a":2}\n');
    const { lines, newOffset, remainder } = readNewLines(filePath, 0);
    assert.deepEqual(lines, ['{"a":1}', '{"a":2}']);
    assert.equal(remainder, '');
    assert.equal(newOffset, Buffer.byteLength('{"a":1}\n{"a":2}\n'));
  });
});

test('a second read from the returned offset picks up only newly-appended lines', () => {
  withTempFile((filePath) => {
    writeFileSync(filePath, '{"a":1}\n');
    const first = readNewLines(filePath, 0);
    assert.deepEqual(first.lines, ['{"a":1}']);

    appendFileSync(filePath, '{"a":2}\n');
    const second = readNewLines(filePath, first.newOffset, first.remainder);
    assert.deepEqual(second.lines, ['{"a":2}']);
  });
});

test('a partial trailing line (mid-write) is held back as remainder, not returned as a line', () => {
  withTempFile((filePath) => {
    writeFileSync(filePath, '{"a":1}\n{"a":2');
    const { lines, remainder } = readNewLines(filePath, 0);
    assert.deepEqual(lines, ['{"a":1}']);
    assert.equal(remainder, '{"a":2');
  });
});

test('a held-back remainder is completed and returned once the rest of the line arrives', () => {
  withTempFile((filePath) => {
    writeFileSync(filePath, '{"a":1}\n{"a":2');
    const first = readNewLines(filePath, 0);
    assert.equal(first.remainder, '{"a":2');

    appendFileSync(filePath, '}\n');
    const second = readNewLines(filePath, first.newOffset, first.remainder);
    assert.deepEqual(second.lines, ['{"a":2}']);
    assert.equal(second.remainder, '');
  });
});

test('reading with no new bytes available returns no lines and an unchanged offset', () => {
  withTempFile((filePath) => {
    writeFileSync(filePath, '{"a":1}\n');
    const first = readNewLines(filePath, 0);
    const second = readNewLines(filePath, first.newOffset, first.remainder);
    assert.deepEqual(second.lines, []);
    assert.equal(second.newOffset, first.newOffset);
  });
});

test('a file that shrank below the previous offset (truncated/replaced) is re-read from the start', () => {
  withTempFile((filePath) => {
    writeFileSync(filePath, '{"a":1}\n{"a":2}\n{"a":3}\n');
    const first = readNewLines(filePath, 0);
    assert.equal(first.lines.length, 3);

    // Simulate a new, shorter journal file replacing this one (e.g. game restart onto a new session).
    writeFileSync(filePath, '{"b":1}\n');
    const second = readNewLines(filePath, first.newOffset, first.remainder);
    assert.deepEqual(second.lines, ['{"b":1}']);
  });
});

test('blank lines within the new bytes are skipped', () => {
  withTempFile((filePath) => {
    writeFileSync(filePath, '{"a":1}\n\n{"a":2}\n');
    const { lines } = readNewLines(filePath, 0);
    assert.deepEqual(lines, ['{"a":1}', '{"a":2}']);
  });
});
