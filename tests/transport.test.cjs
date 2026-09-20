const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('extension/transport.js', 'utf8');

// The /demo page has no service worker, so transport.js must route every message
// type the content scripts send. A missing case only shows up at runtime.
function harness(response) {
  const calls = [];
  const context = {
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    Uint8Array, AbortSignal: { timeout: () => null },
    fetch: async (path, init) => {
      calls.push({ path, ...init });
      return { ok: true, json: async () => response || {} };
    }
  };
  vm.runInNewContext(code, context);
  return { send: context.PuddleSend, calls };
}

test('every message the duck and voice panel send has a route', async () => {
  const item = { id: 'cand_boots' };
  const messages = [
    { type: 'score', item }, { type: 'voice_status' }, { type: 'pond' }, { type: 'read_pond' },
    { type: 'voice_respond', transcript: 'why?', item }, { type: 'skip', item }, { type: 'record_skip', item },
    { type: 'checkout', item }, { type: 'voice_speak', text: 'You returned four pairs.' }
  ];
  const h = harness({ pond: 440 });
  for (const msg of messages) await h.send(msg);
  assert.equal(h.calls.length, messages.length);
});

test('speech posts the reply text to the brain', async () => {
  const h = harness({ audio: 'bXAz', mime: 'audio/mpeg' });
  const result = await h.send({ type: 'voice_speak', text: 'You returned four pairs.' });
  assert.equal(h.calls[0].path, '/voice/speak');
  assert.equal(h.calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(h.calls[0].body), { text: 'You returned four pairs.' });
  assert.equal(result.mime, 'audio/mpeg');
});

test('an unconfigured brain surfaces the detail speech.js falls back on', async () => {
  const context = {
    AbortSignal: { timeout: () => null },
    fetch: async () => ({ ok: false, json: async () => ({ detail: 'Hosted speech is not configured.' }) })
  };
  vm.runInNewContext(code, context);
  await assert.rejects(context.PuddleSend({ type: 'voice_speak', text: 'hi' }), /not configured/);
});
