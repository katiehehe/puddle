# Puddle theme — Field Guide

Adapted from the **naturalist field journal / paper-and-ink** design language —
cream paper, deep ink, ruled lines, and serif display type. The duck reads as a
specimen in a birder's notebook: observed, catalogued, and annotated. No
shadows, no gradients in components; depth comes from ink weight and paper
tone. Hierarchy comes from rules, scale, and typography.

One pond, three surfaces: the checkout duck (content script + popup), the
dashboard, and the web demo. The mock shop (NORTHWICK) is a third-party
retailer and stays neutral on purpose — the duck has to look like it landed
there, not like it lives there.

The palette is declared as CSS custom properties on the dashboard
(`web/src/styles.css`) and as the `PALETTE` object in `extension/content.js`.
There is no build step shared between them, so the values below are the
contract — keep the two declarations in sync.

## Palette

Pond tones on cream paper. The duck is ochre — like a field sketch tinted with
watercolor.

| Token          | Value     | Role                                                        |
|----------------|-----------|-------------------------------------------------------------|
| `duck`         | `#c98a2b` | Brand ochre. Life-mix bars, the Style Sharpe number.        |
| `duck-deep`    | `#8a5a17` | Ochre that passes contrast as text on paper.                |
| `water`        | `#3e6b8e` | Primary data — pond fill, radar, links, "live" state.       |
| `water-dark`   | `#2f5570` | Water hover/emphasis.                                       |
| `water-tint`   | `#e7edf1` | Soft wash behind water-tagged content.                      |
| `reed`         | `#5b7a4b` | "Good" / approving state — olive like riverside reeds.      |
| `reed-dark`    | `#47603a` | Reed as text/number on paper.                               |
| `reed-tint`    | `#e9ecdd` | Soft wash for positive surfaces.                            |
| `warning`      | `#a63d2f` | "Bad" / concerned state, gaps, declines — madder red.       |
| `warning-dark` | `#86301f` | Warning hover/emphasis.                                     |
| `warning-tint` | `#f2e3d9` | Soft wash for negative surfaces.                            |
| `ink`          | `#2c2a24` | Text and every rule/border — warm near-black.               |
| `muted`        | `#8a8270` | Secondary text — faded pencil.                              |
| `line`         | `#cfc5a8` | Hairlines inside cards (paper-dark, not gray).              |
| `surface`      | `#efe8d3` | Card paper — a shade deeper than the page.                  |
| `page`         | `#f6f1e3` | Cream paper canvas with faint ruled lines.                  |
| `block`        | `#e7dfca` | Inset blocks, hover washes.                                 |

## Rules

- **Ink rules, not shadows.** `box-shadow: none`. Structure comes from
  `1px` ink borders, `3px double` rules, and `§` section markers — the way a
  printed journal separates content. Ledger rows get an inset `4px` accent
  stripe instead of a background tint.
- **Paper, not chrome.** The page is cream with faint ruled lines; cards are
  a deeper paper shade framed in ink. Nothing is pure white or pure black.
- **Serif for observation, sans for apparatus.** Display and running text are
  Fraunces / Source Serif 4 (Georgia fallback where fonts can't load, e.g. the
  extension). Labels, table headers, chips, and buttons are Space Grotesk
  small-caps — the stamped annotations of the journal.
- **Italic means quote.** The duck's lines, hints, and the hero sub are set in
  italic serif — handwriting beside the apparatus.
- **State accents are muted natural dyes.** `water` = interactive/data,
  `reed` = go, `warning` = stop, `duck` ochre = brand only. Everything is
  desaturated relative to Flat Pond — print ink, not screen neon.
- **State accents ride the left edge.** The duck card's `4px` left border and
  ledger rows take their accent from `duck_state`.
- **Shape**: square or `2px` radii. No pills with fills — chips are outlined
  ("stamped"), never solid.
- **Motion**: restrained `.15–.3s` transitions on fills only. A journal
  doesn't bounce. `prefers-reduced-motion` kills transitions.
- **Focus**: solid `2px` pond-blue outline with `2px` offset.

## The mascot

The mascot is the duck emoji 🦆 inside a **double-ruled circle** — the specimen
ring of a field plate (`1px` border + `3px double` outline offset). On the
checkout card the mood rides in a small accent-colored badge on the orb —
`?` curious, `!` concerned, `✓` approving, none for idle — while the card's
left edge carries the state color.

Duck-related touches that stay tasteful:

- The pond bar is a ruled track with an ink frame that fills pond blue —
  savings visibly *fill*.
- Footprints (`❋ ❋ ❋`) only in footers/empty states — never in the
  decision card, where they'd cheapen the warning.
