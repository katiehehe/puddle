# Puddle theme — Flat Pond

Adapted from the **Flat Design** system prompt — zero artificial depth.
No shadows, no gradients, no blur, no bevels. Hierarchy comes from color
blocks, scale, and typography. Confidently reductive, digital-native,
print-poster inspired.

One pond, three surfaces: the checkout duck (content script + popup), the
dashboard, and the web demo. The mock shop (NORTHWICK) is a third-party
retailer and stays neutral on purpose — the duck has to look like it landed
there, not like it lives there.

The palette is declared as CSS custom properties on the dashboard
(`web/src/styles.css`) and as the `PALETTE` object in `extension/content.js`.
There is no build step shared between them, so the values below are the
contract — keep the two declarations in sync.

## Palette

Tailwind-adjacent hues, pond semantics. The duck is yellow — literally:
the hero and popup header are a solid `#f2b431` color block.

| Token          | Value     | Role                                                        |
|----------------|-----------|-------------------------------------------------------------|
| `duck`         | `#f2b431` | THE brand color block. Hero, popup header, duck orb, tags.  |
| `duck-deep`    | `#92600a` | Duck hue that passes contrast as text on light tints.       |
| `water`        | `#3b82f6` | Primary action + data. Links, pond fill, radar, live state. |
| `water-dark`   | `#2563eb` | Hover/emphasis for water.                                   |
| `water-tint`   | `#eff6ff` | Soft block: radar zone, chips, row hover.                   |
| `reed`         | `#10b981` | "Good" / approving state.                                   |
| `reed-dark`    | `#059669` | Reed as text/number on tints.                               |
| `reed-tint`    | `#ecfdf5` | Soft block for positive surfaces.                           |
| `warning`      | `#ef4444` | "Bad" / concerned state, gaps, declines.                    |
| `warning-dark` | `#dc2626` | Warning hover/emphasis.                                     |
| `warning-tint` | `#fef2f2` | Soft block for negative surfaces.                           |
| `ink`          | `#111827` | Text — near-black. Also a color block (table header).       |
| `muted`        | `#6b7280` | Secondary text. Never lighter.                              |
| `line`         | `#e5e7eb` | Hairlines, pond track, card separation outline.             |
| `surface`      | `#ffffff` | Cards — white blocks on the gray page.                      |
| `page`/`block` | `#f3f4f6` | Canvas / secondary gray blocks.                             |

## Rules

- **Zero artificial depth.** `box-shadow: none` everywhere. Edges are
  defined by color contrast or honest borders — never fake elevation.
- **Color as structure.** Sections and groups are separated by background
  color blocks (white card on gray page, ink table header, tinted stat
  blocks), not lines or shadows. Row separators are thick `2px` blocks.
- **The duck is yellow.** The hero and popup header are a solid
  `duck`-yellow poster block with `ink` text (high contrast — white text
  on `#f2b431` fails). Decorative geometry is white shapes at ~15% opacity.
- **Semantic, not decorative.** `water` = interactive/data, `reed` = go,
  `warning` = stop. Duck yellow = brand only.
- **State accents ride the left edge.** The duck card's `8px` left border
  and ledger rows take their accent (water/reed/warning) from `duck_state`.
- **Type**: Outfit (400–800) everywhere it's loadable; extension falls
  back to the system geometric stack. Headings `font-weight:800` with
  `letter-spacing:-.02em`. Labels uppercase with wide tracking.
- **Shape**: `6–8px` radii only. Pills (`99px`) are reserved for tags —
  section pills, chips, flag pills. No organic blobs; decoration is
  circles and rotated squares.
- **Motion**: snappy `.2s` transitions. Feedback is scale (`hover:1.02–1.05`)
  and color shifts — never depth. `prefers-reduced-motion` kills transforms.
- **Focus**: no shadows means focus must be loud — solid `3px` water-blue
  outline with `2px` offset.

## The mascot

The mascot is the duck emoji 🦆 inside a **solid duck-yellow circle**
(white circle on the yellow hero). On the checkout card the mood rides in
a small accent-colored badge on the orb — `?` curious, `!` concerned,
`✓` approving, none for idle — while the card's left edge carries the
state color.

Duck-related touches that stay tasteful:

- The pond bar is a flat blue fill rising in a gray track — savings
  visibly *fill*.
- Footprints (`❋ ❋ ❋`) only in footers/empty states — never in the
  decision card, where they'd cheapen the warning.
