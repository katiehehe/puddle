const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

/* The dashboard runs on the vite dev server in development and is served by
 * the brain in production. A bare absolute path therefore means two different
 * servers depending on the build, and vite answers anything it does not
 * recognise with the dashboard itself. That is how the landing page ended up
 * rendering inside its own demo frame, recursively. */

const SOURCES = fs.readdirSync('web/src')
  .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
  .map(f => [f, fs.readFileSync(`web/src/${f}`, 'utf8')]);

test('nothing points at a bare absolute path that vite would answer', () => {
  const offenders = [];
  for (const [name, src] of SOURCES) {
    src.split('\n').forEach((line, i) => {
      if (line.includes('BRAIN')) return;
      // src="/x", href="/x" or fetch("/x"): all resolve to whichever server
      // happens to be hosting the page.
      const m = line.match(/(?:src|href)=["']\/(?!\/)[a-z]|fetch\(\s*["']\/(?!\/)[a-z]/);
      if (m) offenders.push(`${name}:${i + 1} ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, [], 'these need to go through BRAIN:\n' + offenders.join('\n'));
});

test('the demo frame loads the shop from the brain, not from itself', () => {
  const app = fs.readFileSync('web/src/App.tsx', 'utf8');
  const frame = app.split('\n').find(l => l.includes('demoframe'));
  assert.ok(frame, 'the demo frame is gone; this test needs updating');
  assert.match(frame, /\$\{BRAIN\}/,
    'the demo frame must resolve through BRAIN or it loads the dashboard into itself');
});

test('BRAIN is exported so there is one definition of where the brain is', () => {
  assert.match(fs.readFileSync('web/src/api.ts', 'utf8'), /export const BRAIN/);
});
