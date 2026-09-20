# Puddle theme — Clay Pond (Claymorphism)

Adapted from the **Claymorphism** style at
[designprompts.dev](https://www.designprompts.dev/) — "premium digital clay":
soft matte surfaces, super-rounded shapes, layered shadows that simulate a
diffused top-left light source, and bouncy squish physics. Fitting because a
rubber duck is already a clay object — the whole UI becomes the material the
mascot is made of.

One pond, three surfaces: the checkout duck (content script + popup), the
dashboard, and the web demo. The mock shop (NORTHWICK) is a third-party
retailer and stays neutral on purpose — the duck has to look like it landed
there, not like it lives there.

The palette is declared as CSS custom properties on the dashboard
(`web/src/styles.css`) and as the `PALETTE` object in `extension/content.js`.
There is no build step shared between them, so the values below are the
contract — keep the two declarations in sync.

## Palette

Pond hues in clay's candy-shop saturation:

| Token          | Value     | Role                                                        |
|----------------|-----------|-------------------------------------------------------------|
| `duck`         | `#f2b431` | Duck feathers, brand fills, accent blobs. Fill only.        |
| `duck-deep`    | `#8a6408` | Duck hue that passes contrast as text.                      |
| `duck-light`   | `#ffd166` | Light duck for gradient stops.                              |
| `bill`         | `#ef7a2c` | Sparingly: it's loud.                                       |
| `water`        | `#0ea5e9` | Primary action + data color. Links, pond fill, live state.  |
| `water-deep`   | `#0369a1` | Deep water: emphasized labels, pond numbers.                |
| `water-light`  | `#7dd3fc` | Top of the pond-fill gradient (specular sheen).             |
| `ripple`       | `#b8d9ec` | Row dividers, chart rings.                                  |
| `foam`         | `#e3f1f9` | Raised wash: hover rows, chips, pending ledger.             |
| `reed`         | `#10b981` | "Good" / approving state, buy recommendations.              |
| `reed-deep`    | `#047857` | Reed on tinted fills (contrast).                            |
| `warning`      | `#f43f5e` | "Bad" / concerned state, gaps, declines.                    |
| `warning-deep` | `#be123c` | Warning text on tinted fills.                               |
| `ink`          | `#332f3a` | Text — soft charcoal (clay spec, WCAG AA).                  |
| `muted`        | `#635f69` | Secondary text — the clay spec's minimum lightness.         |
| `line`         | `#b8d4e4` | Borders, hairlines.                                         |
| `surface`      | `#ffffff` | Cards — white clay with layered shadow, tinted by blobs.    |
| `page`         | `#eaf2f8` | Canvas — pale sky, never flat (ambient blobs required).     |
| `recessed`     | `#e2edf5` | Pressed-into-clay surfaces: inputs, radar zone, pond track. |

## The clay physics engine

Everything is molded from clay: interactive elements **bulge out**
(convex), fields and tracks **press in** (concave), and nothing sits flat.
Three shadow stacks do the work:

- `clay-card` (floating surface): soft blue-gray drop shadow + top-left
  white highlight + inner rim lights.
- `clay-button` (high convexity): colored drop shadow + top-left highlight
  + inner specular rim + bottom shading.
- `clay-pressed` (recessed): inner shadows top-left, inner highlight
  bottom-right. Inputs, pond track, radar zone.

Rules:

- **Semantic, not decorative.** `water` means interactive-or-data,
  `reed` means go, `warning` means stop. Don't use them for ornament.
- **Duck yellow is a fill, not a text color.** Use `duck-deep` where the
  hue must carry meaning in text.
- **State accents ride the left edge.** The duck card's inner rim and the
  dashboard verdicts take their accent (water/reed/warning) from
  `duck_state`.
- **Zero sharp corners.** Minimum radius is 14px (buttons ~16–20px, cards
  28–32px, hero 48px, pills/orbs full-round). Nested elements subtract ~8px.
- **Type**: Nunito (700–900) for headings, numbers, and labels; DM Sans
  for body (loaded from Google Fonts in `web/index.html`). The extension
  falls back to the system rounded stack.
- **Motion**: card pop `.28s` with slight scale-up; buttons lift
  `-2px` on hover and **squish `scale(.92)` + pressed shadow on active**;
  cards lift `-4px` on hover; the duck orb breathes (`clay-breathe` 6s);
  ambient blobs drift (`clay-float` 10–12s). All off under
  `prefers-reduced-motion: reduce`.

## The mascot

The mascot is the duck emoji 🦆, always inside a **clay orb**: a circular
badge with convex clay shadows and a soft specular gradient. On the
checkout card the mood rides in a small accent-colored clay badge on the
ring — `?` curious, `!` concerned, `✓` approving, none for idle — while the
card's left rim carries the state color.

Duck-related touches that stay tasteful:

- The pond bar is a recessed channel with a convex water fill — savings
  visibly *pool*.
- Footprints (`❋ ❋ ❋`) only in footers/empty states — never in the
  decision card, where they'd cheapen the warning.
