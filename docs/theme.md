# Puddle theme — Daylight Pond

One pond, three surfaces: the checkout duck (content script + popup), the
dashboard, and the web demo. The mock shop (NORTHWICK) is a third-party
retailer and stays neutral on purpose — the duck has to look like it landed
there, not like it lives there.

Daylight Pond is a light theme with real color: a blue-tinted page, a
sunlit duck-yellow→sky hero, and tinted surfaces — not white boxes on
white. Dark ink text keeps everything readable.

The palette is declared as CSS custom properties on the dashboard
(`web/src/styles.css`) and as the `PALETTE` object in `extension/content.js`.
There is no build step shared between them, so the values below are the
contract — keep the two declarations in sync.

## Palette

| Token         | Value     | Role                                                        |
|---------------|-----------|-------------------------------------------------------------|
| `duck`        | `#f2b431` | Duck feathers, brand marks, accent bars. Fill only.         |
| `duck-deep`   | `#8a6408` | Duck hue that passes contrast as text: headline accent.     |
| `duck-shade`  | `#e8a317` | Warm shadow yellow.                                         |
| `bill`        | `#ef7a2c` | Sparingly: it's loud.                                       |
| `water`       | `#1f7ab8` | Primary action + data color. Links, pond fill, live state.  |
| `water-deep`  | `#155e8a` | Deep water: gradient anchor, emphasized labels.             |
| `ripple`      | `#b8d9ec` | Pond-bar track, ripple rings, row dividers.                 |
| `foam`        | `#e3f1f9` | Raised wash: hover rows, chips, pending ledger, table head. |
| `reed`        | `#0e8a52` | "Good" / approving state, buy recommendations.              |
| `warning`     | `#d43d2a` | "Bad" / concerned state, gaps, declines.                    |
| `ink`         | `#16303f` | Text — blue-black, softer than pure black.                  |
| `muted`       | `#4d6b7d` | Secondary text, captions.                                   |
| `line`        | `#b8d4e4` | Borders, hairlines, chart rings.                            |
| `surface`     | `#f4fafd` | Cards — barely-blue, not pure white.                        |
| `surface-hi`  | `#e9f4fb` | Secondary buttons.                                          |
| `page`        | `#dceef7` | App background — under a sky gradient.                      |

Named gradients: **pond-hero** = `#ffe082 → #bfe4f6 55% → #7cc4ec` at
150deg, **duck-card** = `#ffedb8 → #cfe9f7 50% → surface` at 165deg,
**pond-fill** = `water-deep → water` at 90deg on a `ripple` track,
**page-sky** = `#bfe2f2 → page → #d3e9f4`, fixed.

## Rules

- **Semantic, not decorative.** `water` means interactive-or-data,
  `reed` means go, `warning` means stop. Don't use them for ornament.
- **Duck yellow is a fill, not a text color.** `#f2b431` fails contrast as
  text; use `duck-deep` where the hue must carry meaning in text or strokes.
- **State accents ride the left edge.** The duck card and dashboard verdicts
  take their accent (water/reed/warning) from `duck_state`, not the item.
- **Type**: system stack (`-apple-system, Segoe UI, Inter`). Eyebrow labels:
  11–12px, uppercase, `.06–.14em` tracking, `muted`/`water-deep`. Headlines
  use `letter-spacing:-.02em`.
- **Shape**: 8px inputs, 9–12px buttons, 14–18px cards, 99px pills. The pond
  bar is always a pill (`border-radius:99px`) with the `pond-fill` gradient
  on a `ripple` track.
- **Motion**: card pop `.28s ease`, pond fill `.5s ease`, sheen `3.2s` loop.
  All animation off under `prefers-reduced-motion: reduce`.

## The mascot

The mascot is the duck emoji 🦆, always inside a ripple ring: a circular
badge with a water-glow radial and a soft border (`.ducklogo` / `.duckwrap`).
On the checkout card the mood rides in a small accent-colored badge on the
ring — `?` curious, `!` concerned, `✓` approving, none for idle — while the
card's left edge carries the state color.

Duck-related touches that stay tasteful:

- The pond bar's moving sheen reads as a ripple, not a progress stripe.
- Footprints (`❋ ❋ ❋`) only in footers/empty states — never in the
  decision card, where they'd cheapen the warning.
