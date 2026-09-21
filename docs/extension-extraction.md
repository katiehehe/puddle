# Reading a shop that never agreed to be read

The mock shop hands the duck an item on `document.body.dataset.puddleCheckout`.
That is a shop opting in, and nothing on a real storefront will do it. This is
how the extension reads a page that has made no such arrangement.

## Two ways the duck arrives

A shop that drives Puddle itself sets `data-puddle-shop`, and the duck waits to
be summoned. Everywhere else it arrives one of two ways.

**Parked, on a product page.** On a real storefront the buy button submits a
form, so a card drawn in response to that click dies with the page that drew
it — the verdict is on screen for a few hundred milliseconds and then gone. So
the duck reads the product on load, scores it, and waits as a button in the
top-right. A dot coloured by stance says it has an opinion before you click it;
the card opens on a click and stays open, because the product page is not going
anywhere. Closing folds it back to the button rather than dismissing it.

The read repeats on a one-second timer, because a storefront can swap the
product without a reload: Amazon moves between items through `history.pushState`
and changes size and colour in place. The check re-scores only when title,
price, size or colour actually changed, and a verdict that arrives after the
product moved on is dropped rather than shown against the wrong item.

**On a buy click**, still. `extension/content.js` adds one passive,
capture-phase `click` listener. It matches the clicked element against
`button, a, input[type=submit], [role=button]` plus anything whose class or id
contains `checkout`, then tests the element's visible text, `aria-label`,
`name`, `id` and `class` against:

```
/\b(check ?out|buy|add to (bag|cart|basket)|place (your )?order|complete (your )?(order|purchase)|pay now|purchase)\b/i
```

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
| Visible DOM | `.product__title`, `#productTitle`, `h1`; `.price__current`, `.product-price`, `.a-price`, `.price` | `false` |

Amazon publishes none of the first two — no `ld+json`, no price meta — so the
DOM arm is the only one that can answer there, and its price lives in a
`.a-price` component. The inner `.a-offscreen` span looks like the obvious
target and is **empty in the served HTML**, so the wrapper is what gets read.
The buy box is tried before a bare `.a-price`, which also matches a
struck-through list price.

Size and colour come off the controls rather than the title, because the same
garment in another colour is a different thing to own, and
`brain/portfolio.py` now treats colour as part of what a garment *is* when
deciding what can substitute for what. A colour string too long to be a swatch
name is left unset rather than guessed at.

Rules it holds to:

- **An unreadable price is `null`, never `0`.** "Free shipping" must not become
  a $0 item the duck cheerfully approves.
- **Text is capped at 120 characters**, so a hostile title cannot flood the
  speech bubble.
- **No id is ever invented.** A guessed catalog id would silently attach
  another item's return history — the one thing the duck must not get wrong.
- **No readable product means no opinion.** `extract()` returns `null` and the
  duck stays quiet rather than guessing on a homepage.
- **A title it settled for is flagged.** `h1` is the widest hint in the list,
  and on a listing page it is the page heading — *"1-48 of over 50,000 results
  for crewneck sweater"* over whichever price happens to be first in the grid.
  `_guessedTitle` says when the title came from there, and the parked duck
  declines to speak on it. A buy click still scores, because you asked.

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
2. **A scraped item reaches the same verdict as the seeded one** — what a page
   actually hands over: title, price, and the size and colour it states on its
   controls, never an id — for all 9 storefront items. If these drift, the duck
   contradicts itself between the mock shop and a real store.

   Colour is in that list because substitution depends on it: an emerald slip
   dress does not stand in for the black one already hanging up, so a scrape
   that dropped the colour would reach the opposite verdict for a real reason
   rather than a bug. Reading the swatch is what keeps the two paths agreeing.

## Escaping

Everything reaching `shadow.innerHTML` passes through `esc()`. The brain echoes
item titles, sizes and gap labels back inside its lines, and once the duck reads
items off a page we do not control, that text is written by whoever owns the
page. Escape at the sink, not at the source.

## Trying it

The manifest matches the mock shop (`:5500`), the brain's own `/demo` (`:8000`)
and `amazon.com`. To point it at another store, add that origin to
`content_scripts[].matches`. `host_permissions` does not need it: the content
script never fetches the store, it messages the service worker, which is the one
that talks to the brain on `:8000`.

Chrome's per-extension **site access** can override the manifest. If the duck
never appears and DevTools → Sources → *Content scripts* has no Puddle entry,
check `chrome://extensions` → Puddle → Details → Site access is not set to
*On click*.

```bash
node --test tests/extract.test.cjs
```
