const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const code = fs.readFileSync('extension/extract.js', 'utf8');

/* A DOM small enough to reason about: querySelector/querySelectorAll over a
 * declared list of fake nodes, keyed by the selectors a test wants to answer. */
function doc(spec) {
  const { ld = [], nodes = {} } = spec;
  return {
    querySelectorAll(selector) {
      if (selector === 'script[type="application/ld+json"]') {
        return ld.map(textContent => ({ textContent }));
      }
      return [];
    },
    querySelector(selector) {
      const hit = nodes[selector];
      if (!hit) return null;
      return {
        textContent: hit.text ?? '',
        value: hit.value,
        tagName: hit.tagName ?? 'DIV',
        options: hit.options,
        selectedIndex: hit.selectedIndex,
        getAttribute: key => (hit.attrs ?? {})[key] ?? null,
      };
    },
  };
}

function load() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.PuddleExtract;
}

const extract = load();

test('prefers JSON-LD, the thing the page published on purpose', () => {
  const found = extract(doc({
    ld: [JSON.stringify({
      '@type': 'Product', name: 'Chelsea boots', offers: { price: '128.00' },
    })],
    nodes: { h1: { text: 'Some other heading' }, '.price': { text: '$9' } },
  }));
  assert.equal(found.title, 'Chelsea boots');
  assert.equal(found.price, 128);
  assert.equal(found._source, 'json-ld');
  assert.equal(found._confident, true);
});

test('walks an @graph rather than giving up on it', () => {
  const found = extract(doc({
    ld: [JSON.stringify({
      '@graph': [
        { '@type': 'BreadcrumbList' },
        { '@type': ['Product'], name: 'Rain shell', offers: [{ price: 110 }] },
      ],
    })],
  }));
  assert.equal(found.title, 'Rain shell');
  assert.equal(found.price, 110);
});

test('falls back to OpenGraph when there is no JSON-LD', () => {
  const found = extract(doc({
    nodes: {
      'meta[property="og:title"]': { attrs: { content: 'Wool blazer' } },
      'meta[property="product:price:amount"]': { attrs: { content: '165' } },
    },
  }));
  assert.equal(found.title, 'Wool blazer');
  assert.equal(found.price, 165);
  assert.equal(found._source, 'meta');
});

test('falls back to visible DOM, and says it is not confident', () => {
  const found = extract(doc({
    nodes: { h1: { text: '  Platform   sneakers \n' }, '.price': { text: 'USD 95.00' } },
  }));
  assert.equal(found.title, 'Platform sneakers');
  assert.equal(found.price, 95);
  assert.equal(found._source, 'dom');
  assert.equal(found._confident, false);
});

test('returns null on a page that is not a product page', () => {
  assert.equal(extract(doc({ nodes: { h1: { text: 'Welcome to the shop' } } })), null);
});

test('an unreadable price is null, never zero', () => {
  // "Free shipping" must not become a $0 item the duck happily approves.
  assert.equal(extract(doc({ nodes: { h1: { text: 'Tote' }, '.price': { text: 'Free shipping' } } })), null);
});

test('strips thousands separators and currency noise', () => {
  const found = extract(doc({
    nodes: { h1: { text: 'Wool coat' }, '.price': { text: '$1,299.00' } },
  }));
  assert.equal(found.price, 1299);
});

test('caps runaway text so a hostile page cannot flood the bubble', () => {
  const found = extract(doc({
    nodes: { h1: { text: 'x'.repeat(5000) }, '.price': { text: '$10' } },
  }));
  assert.ok(found.title.length <= 120, `title was ${found.title.length} chars`);
});

test('never invents an id, which would borrow another item history', () => {
  const found = extract(doc({
    nodes: { h1: { text: 'Tank' }, '.price': { text: '$24' } },
  }));
  assert.equal(found.id, undefined);
});

test('reads a selected size off a select', () => {
  const found = extract(doc({
    nodes: {
      h1: { text: 'Chelsea boots' },
      '.price': { text: '$128' },
      "select[name*='size' i], select[id*='size' i], [data-option-name='Size'] [aria-checked='true'], [name*='size' i][type='radio']:checked":
        { tagName: 'SELECT', options: [{ textContent: 'Size 8' }], selectedIndex: 0 },
    },
  }));
  assert.equal(found.size, '8');
});

test('omits size entirely when the page does not express one', () => {
  const found = extract(doc({ nodes: { h1: { text: 'Scarf' }, '.price': { text: '$74' } } }));
  assert.equal('size' in found, false);
});

test('survives malformed JSON-LD instead of throwing', () => {
  const found = extract(doc({
    ld: ['{ not json at all'],
    nodes: { h1: { text: 'Denim jacket' }, '.price': { text: '$95' } },
  }));
  assert.equal(found.title, 'Denim jacket');
  assert.equal(found._source, 'dom');
});
