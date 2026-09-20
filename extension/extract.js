/* Reading a product off a page the shop did not prepare for us.
 *
 * The mock shop hands us an item on `data-puddle-checkout`. A real storefront
 * will not, so the duck has to read the page itself. Three sources, tried in
 * order of how much the page has committed to:
 *
 *   1. JSON-LD (schema.org/Product) - a contract the page published on purpose
 *   2. OpenGraph / microdata meta tags - the same intent, less structure
 *   3. Visible DOM text - a guess, and labelled as one
 *
 * Nothing here trusts what it reads. Every field is clamped, coerced and
 * length-limited before it leaves, because the next stop is the scoring API
 * and, after that, the duck's speech bubble.
 */
(() => {
  const TEXT_CAP = 120;

  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_CAP);

  // "$1,299.00" -> 1299, "USD 89" -> 89. Returns null rather than guessing 0:
  // a free item and an unreadable price are not the same thing.
  function toPrice(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : null;
    const match = String(value ?? "").replace(/[ ,]/g, "").match(/\d+(?:\.\d{1,2})?/);
    if (!match) return null;
    const price = Number.parseFloat(match[0]);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function fromJsonLd(doc) {
    const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    for (const block of blocks) {
      let data;
      try { data = JSON.parse(block.textContent); } catch { continue; }
      // A page may publish a graph, an array, or a bare object.
      const nodes = [];
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        nodes.push(node);
        if (node["@graph"]) walk(node["@graph"]);
      };
      walk(data);
      for (const node of nodes) {
        const types = [].concat(node["@type"] ?? []);
        if (!types.some((t) => String(t).toLowerCase() === "product")) continue;
        const offers = [].concat(node.offers ?? [])[0] ?? {};
        const price = toPrice(offers.price ?? offers.lowPrice ?? node.price);
        const title = clean(node.name);
        if (title && price) {
          return { title, price, source: "json-ld", confident: true };
        }
      }
    }
    return null;
  }

  function fromMeta(doc) {
    const meta = (selector, attr = "content") => doc.querySelector(selector)?.getAttribute(attr);
    const title = clean(
      meta('meta[property="og:title"]') ||
      meta('meta[name="twitter:title"]') ||
      meta('[itemprop="name"]', "content") ||
      doc.querySelector('[itemprop="name"]')?.textContent
    );
    const price = toPrice(
      meta('meta[property="product:price:amount"]') ||
      meta('meta[property="og:price:amount"]') ||
      meta('[itemprop="price"]', "content") ||
      doc.querySelector('[itemprop="price"]')?.textContent
    );
    if (title && price) return { title, price, source: "meta", confident: true };
    return null;
  }

  // Last resort. Stable-ish conventions across storefronts, widest last.
  const TITLE_HINTS = [
    "h1[itemprop='name']", ".product__title", ".product-title", "[data-product-title]",
    "h1.product-name", "#productTitle", "h1",
  ];
  const PRICE_HINTS = [
    "[data-product-price]", ".price__current", ".product__price", ".price-item--sale",
    ".price-item--regular", ".product-price", "#priceblock_ourprice",
    // Amazon renders the price as a component, not a labelled element: the
    // `.a-price` wrapper is the only node holding the whole amount. Its inner
    // `.a-offscreen` span looks like the obvious target and is empty in the
    // served HTML, so read the wrapper. Scoped to the buy box first, because a
    // bare `.a-price` also matches a struck-through list price.
    "#corePriceDisplay_desktop_feature_div .a-price", "#corePrice_feature_div .a-price",
    ".a-price", ".price",
  ];

  function fromVisibleDom(doc) {
    const pick = (selectors) => {
      for (const selector of selectors) {
        let node;
        try { node = doc.querySelector(selector); } catch { continue; }
        const text = clean(node?.textContent);
        if (text) return { text, selector };
      }
      return { text: "", selector: null };
    };
    const title = pick(TITLE_HINTS);
    const price = toPrice(pick(PRICE_HINTS).text);
    if (title.text && price) {
      return {
        title: title.text, price, source: "dom", confident: false,
        // `h1` is the widest hint there is, and on a listing page it is the
        // page heading -- "1-48 of over 50,000 results for ..." over whichever
        // price happens to be first in the grid. Say when the title came from
        // there, so a caller nobody invited can decline to speak.
        guessed: title.selector === "h1",
      };
    }
    return null;
  }

  // Size, when the page exposes it as a chosen control rather than a label.
  function readSize(doc) {
    const control = doc.querySelector(
      "select[name*='size' i], select[id*='size' i], [data-option-name='Size'] [aria-checked='true'], " +
      "[name*='size' i][type='radio']:checked"
    );
    if (!control) return null;
    const raw = control.tagName === "SELECT"
      ? control.options?.[control.selectedIndex]?.textContent
      : control.value ?? control.textContent;
    const text = clean(raw);
    // "Size 8" / "US 8" / "8" -> "8"; anything wordier is probably not a size.
    const match = text.match(/\b(\d{1,2}(?:\.5)?|XX?S|XX?L|S|M|L)\b/i);
    return match ? match[1].toUpperCase() : null;
  }

  /* Colour, which a storefront states as the swatch you picked rather than a
   * word in the title. Amazon names it twice depending on the layout it serves
   * -- the inline twister, or the older variation block -- and other shops
   * expose it the same way they expose size. */
  function readColor(doc) {
    const node = doc.querySelector(
      "#inline-twister-expanded-dimension-text-color_name, #variation_color_name .selection, " +
      "select[name*='color' i], select[id*='color' i], [data-option-name='Color'] [aria-checked='true'], " +
      "[name*='color' i][type='radio']:checked"
    );
    if (!node) return null;
    const raw = node.tagName === "SELECT"
      ? node.options?.[node.selectedIndex]?.textContent
      : node.value ?? node.textContent;
    // A swatch name is a word or two. Anything longer is a description that
    // happened to sit in a colour-ish container, and guessing from it is worse
    // than leaving colour unset.
    const text = clean(raw).toLowerCase();
    return text && text.length <= 24 ? text : null;
  }

  /* Returns null when the page does not look like a product page at all --
   * a duck that guesses on a homepage is worse than a silent one. */
  globalThis.PuddleExtract = function extract(doc = document) {
    const found = fromJsonLd(doc) || fromMeta(doc) || fromVisibleDom(doc);
    if (!found) return null;
    const size = readSize(doc);
    const color = readColor(doc);
    return {
      // No id: the brain scores unknown items on their attributes. Sending a
      // guessed catalog id would silently attach someone else's history.
      title: found.title,
      price: found.price,
      ...(size ? { size } : {}),
      ...(color ? { color } : {}),
      _source: found.source,
      _confident: found.confident,
      // True when the title is a page heading we settled for, not a product
      // name the page pointed at. See fromVisibleDom.
      _guessedTitle: found.guessed === true,
    };
  };
})();
