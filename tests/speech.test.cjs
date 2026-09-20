const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('extension/speech.js', 'utf8');

function harness({ reply, error } = {}) {
  const spoken = [], played = [], requests = [], revoked = [];
  const context = {
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    Uint8Array, Blob, URL: {
      createObjectURL: () => 'blob:duck',
      revokeObjectURL: url => revoked.push(url)
    },
    Audio: class {
      constructor(url) { this.url = url; played.push(this); }
      play() { return Promise.resolve(); }
      pause() { this.paused = true; }
    },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: { cancelled: 0, cancel() { this.cancelled += 1; }, speak(u) { spoken.push(u.text); } },
    PuddleSend: async msg => {
      requests.push(msg);
      if (error) throw new Error(error);
      return reply || { audio: Buffer.from('mp3').toString('base64'), mime: 'audio/mpeg' };
    }
  };
  vm.runInNewContext(code, context);
  return { speech: context.PuddleSpeech, spoken, played, requests, revoked, context };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a configured brain renders the reply with ElevenLabs, not the browser', async () => {
  const h = harness();
  await h.speech.speak('You returned four pairs.');
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].type, 'voice_speak');
  assert.equal(h.requests[0].text, 'You returned four pairs.');
  assert.equal(h.played.length, 1);
  assert.equal(h.spoken.length, 0);
});

test('a missing key falls back to browser speech and stops asking', async () => {
  const h = harness({ error: 'Hosted speech is not configured.' });
  await h.speech.speak('First line.');
  await h.speech.speak('Second line.');
  assert.deepEqual([...h.spoken], ['First line.', 'Second line.']);
  assert.equal(h.requests.length, 1);
});

test('a transient failure falls back but keeps trying hosted speech', async () => {
  const h = harness({ error: 'ElevenLabs is rate limited right now.' });
  await h.speech.speak('First line.');
  await h.speech.speak('Second line.');
  assert.deepEqual([...h.spoken], ['First line.', 'Second line.']);
  assert.equal(h.requests.length, 2);
});

test('a new reply cancels the audio still playing and drops its blob', async () => {
  const h = harness();
  await h.speech.speak('First line.');
  await h.speech.speak('Second line.');
  assert.equal(h.played[0].paused, true);
  assert.deepEqual([...h.revoked], ['blob:duck']);
  assert.equal(h.played.length, 2);
});

test('audio that arrives after a cancel is never played', async () => {
  const h = harness();
  const pending = h.speech.speak('First line.');
  h.speech.cancel();
  await pending;
  await settle();
  assert.equal(h.played.length, 0);
  assert.equal(h.spoken.length, 0);
});

test('empty replies are ignored', async () => {
  const h = harness();
  await h.speech.speak('   ');
  assert.equal(h.requests.length, 0);
});
