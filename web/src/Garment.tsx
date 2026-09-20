/** Clothes drawn as clothes.
 *
 *  A closet full of table rows reads like a spreadsheet, so every piece gets a
 *  flat garment silhouette tinted with the colour the item actually is. One
 *  shape per category, one fill per colour word, no image hosting.
 */

const FILL: Record<string, string> = {
  charcoal: "#3f4550",
  grey: "#9aa2ad",
  black: "#23262d",
  white: "#e9ebef",
  indigo: "#3b5a8c",
  blue: "#4b74b8",
  navy: "#2b3b5c",
  red: "#c8493f",
  silver: "#c3c8d2",
  olive: "#6f7a4d",
  green: "#5d7f5a",
  tan: "#c8a883",
  brown: "#8a6244",
  cream: "#e6dcc8",
  pink: "#dda0ae",
  purple: "#7c6aa8",
  yellow: "#e0b64a",
};

export function colourOf(colour: string): string {
  return FILL[colour.toLowerCase().trim()] ?? "#8f9aa8";
}

const PATHS: Record<string, string> = {
  // t-shirt
  top: "M22 16 L34 10 h20 l12 6 -6 12 -6 -3 v35 h-20 v-35 l-6 3 z",
  // trousers
  bottom: "M30 8 h28 l4 56 h-12 l-6 -32 -6 32 h-12 z",
  // dress
  dress: "M28 12 L40 8 h8 l12 4 -6 10 4 42 h-28 l4 -42 z",
  // jacket with lapels
  outer: "M20 16 L34 9 v10 l6 6 6 -6 V9 l14 7 -4 14 v34 h-32 v-34 z",
  // sneaker
  shoes: "M14 44 h14 l10 6 h16 c8 0 14 3 14 8 v6 h-54 z",
  // beanie / small good
  accessory: "M24 44 c0 -14 8 -22 20 -22 s20 8 20 22 v6 h-40 z",
};

export function Garment({ category, colour, size = 88 }: { category: string; colour: string; size?: number }) {
  const path = PATHS[category] ?? PATHS.accessory;
  return (
    <svg viewBox="0 0 88 72" width={size} height={(size * 72) / 88} role="img" aria-label={category}>
      <path d={path} fill={colourOf(colour)} />
    </svg>
  );
}
