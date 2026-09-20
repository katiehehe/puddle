# Reading a shop that never agreed to be read

The mock shop hands the duck an item on `document.body.dataset.puddleCheckout`.
That is a shop opting in, and nothing on a real storefront will do it. This is
how the extension reads a page that has made no such arrangement.

## Noticing checkout

`extension/content.js` adds one passive, capture-phase `click` listener. It
matches the clicked element against `button, a, input[type=submit], [role=button]`
plus anything whose class or id contains `checkout`, then tests the element's
visible text, `aria-label`, `name`, `id` and `class` against
`/\b(check ?out|buy|add to (bag|cart)|place order|pay|purchase)\b/i`.

The click is never intercepted. `preventDefault` is never called, nothing is
swallowed, and the page's own handler runs exactly as it would with the
extension uninstalled. The duck is a bystander that speaks up, not a gate —
PRD 8.1: *never blocks, one tap overrules.*

The listener then yields with `setTimeout(..., 0)` before doing anything.
Capture runs *before* the page's own handler, so a shop that sets the dataset
attribute has not set it yet; yielding lets it win. An opted-in shop describes
its product better than we can infer it, and scoring both ways would render the
card twice.

## Extracting the product

`extension/extract.js` tries three sources, in order of how much the page has
committed to:

| Source | What it is | `_confident` |
|---|---|---|
| `application/ld+json` | schema.org `Product`, published on purpose. Walks `@graph` and arrays. | `true` |
| OpenGraph / microdata | `og:title`, `product:price:amount`, `[itemprop]`. Same intent, less structure. | `true` |
| Visible DOM | `.product__title`, `#productTitle`, `h1`; `.price__current`, `.product-price`, `.price` | `false` |

Rules it holds to:

- **An unreadable price is `null`, never `0`.** "Free shipping" must not become
  a $0 item the duck cheerfully approves.
- **Text is capped at 120 characters**, so a hostile title cannot flood the
  speech bubble.
- **No id is ever invented.** A guessed catalog id would silently attach
  another item's return history — the one thing the duck must not get wrong.
- **No readable product means no opinion.** `extract()` returns `null` and the
  duck stays quiet rather than guessing on a homepage.

## Filling in what a page never states

A storefront publishes a title and a price, not a formality rating, and
`catalog.coerce_item` refuses an item without `formality` and `warmth`.
`brain/infer.py` bridges the two: keyword → attributes, the rule-based arm of
PRD 3.1, no model involved.

It is deliberately narrow. An unrecognised garment returns `None`, `coerce_item`
returns `None`, and the duck says nothing — being silent is much cheaper than
confidently pricing the risk of something we could not identify.

Two properties are pinned by tests in `tests/test_infer.py`:

1. **Inference agrees with the catalog** it will be compared against, within one
   point of formality and warmth, for all 35 seeded items.
2. **A scraped item reaches the same verdict as the seeded one** — title and
   price only, no id, no attributes — for all 9 storefront items. If these drift,
   the duck contradicts itself between the mock shop and a real store.

## Escaping

Everything reaching `shadow.innerHTML` passes through `esc()`. The brain echoes
item titles, sizes and gap labels back inside its lines, and once the duck reads
items off a page we do not control, that text is written by whoever owns the
page. Escape at the sink, not at the source.

## Trying it

The manifest matches only the mock shop (`:5500`) and the brain's own `/demo`
(`:8000`). To point it at a real store, add that origin to both
`content_scripts[].matches` and `host_permissions`.

```bash
node --test tests/extract.test.cjs
```
