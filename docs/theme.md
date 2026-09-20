# Puddle theme

One pond, three surfaces: the checkout duck (content script + popup), the
dashboard, and the web demo. They share one palette and one mascot. The mock
shop (NORTHWICK) is a third-party retailer and stays neutral on purpose —
the duck has to look like it landed there, not like it lives there.

The palette is declared as CSS custom properties on the dashboard
(`web/src/styles.css`) and as the `PALETTE` object in `extension/content.js`.
There is no build step shared between them, so the values below are the
contract — keep the two declarations in sync.

## Palette

| Token        | Value     | Role                                                        |
|--------------|-----------|-------------------------------------------------------------|
| `duck`       | `#f2b431` | Duck feathers, brand marks. Fill only — never text on white. |
| `duck-deep`  | `#a97c12` | Duck accents that need contrast: brows, small text, strokes.|
| `bill`       | `#ef7a2c` | The bill. Sparingly: it's loud.                             |
| `water`      | `#2a7fb8` | Primary action + data color. Pond fill, links, live state.  |
| `water-deep` | `#1d5f8a` | Gradient anchor for water, hover on primary.                |
| `ripple`     | `#dceaf4` | Water shadows, rings, track of the pond bar.                |
| `foam`       | `#f4fafd` | Lightest water tint: hero gradients, card washes.           |
| `reed`       | `#0d7a4a` | "Good" / approving state, buy recommendations.              |
| `warning`    | `#b3261e` | "Bad" / concerned state, gaps, declines.                    |
| `ink`        | `#16191c` | Text.                                                       |
| `muted`      | `#5d6771` | Secondary text, captions.                                   |
| `line`       | `#e4e8ec` | Borders, hairlines, chart rings.                            |
| `surface`    | `#ffffff` | Cards.                                                      |
| `page`       | `#f5f7f9` | App background.                                             |

## Rules

- **Semantic, not decorative.** `water` means interactive-or-data,
  `reed` means go, `warning` means stop. Don't use them for ornament.
- **Duck yellow is a fill, not a text color.** `#f2b431` on white is ~1.9:1 —
  fine for a 30px duck, unreadable at 12px. Use `duck-deep` where the hue
  must carry meaning in text or thin strokes.
- **State accents ride the left edge.** The duck card and dashboard verdicts
  take their accent (water/reed/warning) from `duck_state`, not from the item.
- **Type**: system stack (`-apple-system, Segoe UI, Inter`). Eyebrow labels:
  11–12px, uppercase, `.06–.14em` tracking, `muted`. Headlines use
  `letter-spacing:-.02em`.
- **Shape**: 8px inputs, 9–12px buttons, 14–18px cards, 99px pills. The pond
  bar is always a pill (`border-radius:99px`) with a `water`→`water-deep`
  gradient on a `ripple` track.
- **Motion**: card pop `.28s ease`, pond fill `.5s ease`, sheen `.6s` loop.
  All animation off under `prefers-reduced-motion: reduce`.

## The mascot

The duck is a 110×110 SVG (`DUCK` in `content.js`, `DuckLogo` in
`web/src/App.tsx`) sitting on two ripple ellipses. Eyes and brow carry the
four moods — idle, curious, concerned, approving. Use `idle` for logos and
empty states; the mood faces belong to the checkout card.

Duck-related touches that stay tasteful:

- Ripple rings behind the hero duck on the dashboard.
- The pond bar's moving sheen reads as a ripple, not a progress stripe.
- Footprints (`🐾`-style marks) only in footers/empty states — never in the
  decision card, where they'd cheapen the warning.
