const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const code = fs.readFileSync('extension/voice.js', 'utf8');

function harness({ configured = false, getUserMedia, speechAvailable = true } = {}) {
  const nodes = new Map();
  const calls = [], tracks = [], recorders = [];
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      hidden: false, disabled: false, textContent: '', value: '', style: {},
      attributes: {}, setAttribute(k, v) { this.attributes[k] = v; },
      addEventListener(k, v) { this[k] = v; }, remove() { this.removed = true; }
    });
    return nodes.get(selector);
  };
  const panel = { querySelector: node, remove() { this.removed = true; } };
  const acquired = () => {
    const track = { stopped: false, stop() { this.stopped = true; } };
    tracks.push(track); return { getTracks: () => [track] };
  };
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['fake-audio']) });
      queueMicrotask(() => this.onstop?.());
    }
  }
  const context = {
    document: { createElement: () => panel },
    chrome: { runtime: { sendMessage(msg, callback) {
      calls.push(msg);
      const replies = {
        voice_status: { configured }, voice_transcribe: { transcript: 'Why these?' },
        voice_respond: { answer: 'You returned four pairs.', pending_action: msg.transcript === 'skip this' ? 'skip' : null },
        record_skip: { pond: { saved: 128 } }
      };
      queueMicrotask(() => callback(replies[msg.type]));
    } } },
    navigator: { mediaDevices: { getUserMedia: getUserMedia || (async () => acquired()) } },
    MediaRecorder: Recorder, Blob, crypto: webcrypto, setTimeout, clearTimeout,
    FileReader: class { readAsDataURL() { this.result = 'data:audio/webm;base64,ZmFrZQ=='; this.onload(); } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: { cancel() {}, speak() {} }
  };
  if (!speechAvailable) { delete context.speechSynthesis; delete context.SpeechSynthesisUtterance; }
  context.PuddleSend = msg => new Promise(resolve => context.chrome.runtime.sendMessage(msg, resolve));
  vm.runInNewContext(code, context);
  let saved;
  const dispose = context.PuddleVoice.attach({ querySelector: () => ({ appendChild() {} }) },
    { id: 'cand_boots' }, value => saved = value);
  return { node, dispose, calls, tracks, recorders, acquired, get saved() { return saved; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('without a key, typing works and microphone stays disabled', async () => {
  const h = harness(); await settle();
  assert.equal(h.node('.voice-mic').disabled, true);
  h.node('input').value = 'Why these?';
  await h.node('.voice-form').submit({ preventDefault() {} });
  assert.equal(h.node('.voice-answer').textContent, 'You returned four pairs.');
  assert.equal(h.calls.some(m => m.type === 'voice_transcribe'), false);
  h.dispose();
});

test('record, stop, transcribe and respond release the microphone', async () => {
  const h = harness({ configured: true }); await settle();
  await h.node('.voice-mic').onclick();
  assert.equal(h.recorders[0].state, 'recording');
  await h.node('.voice-mic').onclick(); await settle();
  assert.ok(h.tracks.every(t => t.stopped));
  assert.equal(h.calls.filter(m => m.type === 'voice_transcribe').length, 1);
  assert.equal(h.node('.voice-answer').textContent, 'You returned four pairs.');
  h.dispose();
});

test('cancel discards audio and releases tracks', async () => {
  const h = harness({ configured: true }); await settle();
  await h.node('.voice-mic').onclick();
  h.node('.voice-cancel').onclick(); await settle();
  assert.ok(h.tracks.every(t => t.stopped));
  assert.equal(h.calls.some(m => m.type === 'voice_transcribe'), false);
  h.dispose();
});

test('disposal while permission is pending closes the late-acquired microphone', async () => {
  let resolve;
  const h = harness({ configured: true, getUserMedia: () => new Promise(r => resolve = r) });
  await settle();
  const pending = h.node('.voice-mic').onclick();
  h.dispose(); resolve(h.acquired()); await pending;
  assert.ok(h.tracks.every(t => t.stopped));
  assert.equal(h.recorders.length, 0);
});

test('a skip question needs explicit confirmation before recording an action', async () => {
  const h = harness(); await settle();
  h.node('input').value = 'skip this';
  await h.node('.voice-form').submit({ preventDefault() {} });
  assert.equal(h.calls.some(m => m.type === 'record_skip'), false);
  await h.node('.voice-confirm').onclick();
  assert.equal(h.calls.filter(m => m.type === 'record_skip').length, 1);
  assert.equal(h.saved, 128);
  h.dispose();
});


test('typed questions and cleanup work without browser speech output', async () => {
  const h = harness({ speechAvailable: false }); await settle();
  h.node('input').value = 'Why these?';
  await h.node('.voice-form').submit({ preventDefault() {} });
  assert.equal(h.node('.voice-answer').textContent, 'You returned four pairs.');
  assert.equal(h.node('[type=submit]').disabled, false);
  h.node('.voice-mute').onclick();
  h.dispose();
});

test('a cancelled permission request cannot stop a newer recording', async () => {
  let rejectFirst, count = 0;
  const h = harness({ configured: true, getUserMedia: () => ++count === 1
    ? new Promise((resolve, reject) => { rejectFirst = reject; })
    : Promise.resolve(h.acquired()) });
  await settle();
  const first = h.node('.voice-mic').onclick();
  h.node('.voice-cancel').onclick();
  await h.node('.voice-mic').onclick();
  rejectFirst(new Error('Old permission request failed'));
  await first;
  assert.equal(h.tracks[0].stopped, false);
  assert.equal(h.node('.voice-mic').textContent, 'Stop and ask');
  h.dispose();
});
