import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atan2, exp2, log2, sinTurns, tanh } from '../src/core/dspmath.ts';
import { indexToMidi, nearestIndex, SCALES } from '../src/core/music.ts';

test('sinTurns tracks Math.sin', () => {
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000 - 0.3;
    assert.ok(Math.abs(sinTurns(t) - Math.sin(2 * Math.PI * t)) < 1e-6);
  }
});

test('sinTurns is finite at the wrap edge (tiny negative phases)', () => {
  for (const t of [-1e-19, -3e-19, -1e-17, -Number.MIN_VALUE, 1 - 1e-17, -1, 0]) {
    assert.ok(Number.isFinite(sinTurns(t)), String(t));
  }
});

test('exp2 / log2 track the built-ins', () => {
  for (let x = -40; x <= 40; x += 0.37) assert.ok(Math.abs(exp2(x) / 2 ** x - 1) < 1e-12);
  for (let x = 0.001; x < 1e5; x *= 1.7) assert.ok(Math.abs(log2(x) - Math.log2(x)) < 1e-12);
});

test('atan2 tracks Math.atan2', () => {
  for (let i = 0; i < 360; i += 7) {
    const a = (i * Math.PI) / 180;
    const y = Math.sin(a) * 3;
    const x = Math.cos(a) * 3;
    assert.ok(Math.abs(atan2(y, x) - Math.atan2(y, x)) < 1e-9);
  }
});

test('tanh approximation is bounded and odd', () => {
  for (let x = -5; x <= 5; x += 0.1) {
    assert.ok(Math.abs(tanh(x)) <= 1);
    assert.equal(tanh(-x), -tanh(x));
  }
});

test('scale ladder round-trips', () => {
  const steps = SCALES.minorPentatonic;
  for (let i = -20; i < 20; i++) assert.equal(nearestIndex(indexToMidi(i, 2, steps), 2, steps), i);
});

function* tsFiles(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* tsFiles(p);
    else if (p.endsWith('.ts')) yield p;
  }
}

test('core never calls non-deterministic Math functions', () => {
  const core = fileURLToPath(new URL('../src/core', import.meta.url));
  const banned = /Math\.(sin|cos|tan|exp|expm1|pow|log|log2|log10|log1p|tanh|sinh|cosh|atan|atan2|asin|acos|cbrt|hypot)\b|\*\*/;
  for (const f of tsFiles(core)) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return;
        const code = t.replace(/\/\/.*$/, '');
        assert.ok(!banned.test(code), `${f}:${i + 1}: ${t}`);
      });
  }
});
