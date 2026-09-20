# Puddle theme — Night Pond

One pond, three surfaces: the checkout duck (content script + popup), the
dashboard, and the web demo. The mock shop (NORTHWICK) is a third-party
retailer and stays neutral on purpose — the duck has to look like it landed
there, not like it lives there.

Night Pond is a dark theme: deep water surfaces with duck-yellow and
bright-water accents, so the mascot and the data both pop.

The palette is declared as CSS custom properties on the dashboard
(`web/src/styles.css`) and as the `PALETTE` object in `extension/content.js`.
There is no build step shared between them, so the values below are the
contract — keep the two declarations in sync.

## Palette

| Token         | Value     | Role                                                        |
|---------------|-----------|-------------------------------------------------------------|
| `duck`        | `#f2b431` | Duck feathers, brand marks, headline accent.                |
| `duck-deep`   | `#ffd166` | Lightened duck yellow for text/thin strokes on dark.        |
| `bill`        | `#ef7a2c` | Sparingly: it's loud.                                       |
| `water`       | `#4fb0e6` | Primary action + data color. Links, pond fill, live state.  |
| `water-deep`  | `#9fd6f2` | Lightened water for text emphasis and gradient tops.        |
| `ripple`      | `#1d4560` | Pond-bar track, ripple rings, dark water details.           |
| `foam`        | `#16374f` | Raised wash: hover rows, chips, pending ledger.             |
| `reed`        | `#46c586` | "Good" / approving state, buy recommendations.              |
| `warning`     | `#ff7a6e` | "Bad" / concerned state, gaps, declines.                    |
| `ink`         | `#eaf4fa` | Text.                                                       |
| `muted`       | `#9db8c9` | Secondary text, captions.                                   |
| `line`        | `#2b5878` | Borders, hairlines, chart rings.                            |
| `surface`     | `#123047` | Cards.                                                      |
| `surface-hi`  | `#1a3f5c` | Card tops, secondary buttons.                               |
| `page`        | `#0b1f2e` | App background.                                             |

Named gradients: **night-hero** = `#1e4b6b → surface 60% → #0e2740` at
150deg, **duck-card** = `surface-hi → surface 55% → page` at 165deg,
**pond-fill** = `water → water-deep` at 90deg on a `ripple` track,
**page-sky** = `#10334c → page` at 180deg, fixed.

## Rules

- **Semantic, not decorative.** `water` means interactive-or-data,
  `reed` means go, `warning` means stop. Don't use them for ornament.
- **State accents ride the left edge.** The duck card and dashboard verdicts
  take their accent (water/reed/warning) from `duck_state`, not the item.
- **Type**: system stack (`-apple-system, Segoe UI, Inter`). Eyebrow labels:
  11–12px, uppercase, `.06–.14em` tracking, `water` or `muted`. Headlines use
  `letter-spacing:-.02em`.
- **Shape**: 8px inputs, 9–12px buttons, 14–18px cards, 99px pills. The pond
  bar is always a pill (`border-radius:99px`) with the `pond-fill` gradient
  on a `ripple` track.
- **Motion**: card pop `.28s ease`, pond fill `.5s ease`, sheen `3.2s` loop.
  All animation off under `prefers-reduced-motion: reduce`.

## The mascot

The mascot is the duck emoji 🦆, always inside a ripple ring: a circular
`ripple`-bordered badge with a radial water glow under it
(`.ducklogo` / `.duckwrap`). On the checkout card the mood rides in a small
accent-colored badge on the ring — `?` curious, `!` concerned, `✓` approving,
none for idle — while the card's left edge carries the state color.

Duck-related touches that stay tasteful:

- The pond bar's moving sheen reads as a ripple, not a progress stripe.
- Footprints (`❋ ❋ ❋`) only in footers/empty states — never in the
  decision card, where they'd cheapen the warning.
