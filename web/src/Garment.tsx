/** Clothes drawn as clothes.
 *
 *  A closet full of table rows reads like a spreadsheet, so every piece gets a
 *  flat garment silhouette tinted with the colour the item actually is. Kind
 *  beats category where the item knows it (boots and heels are both "shoes"),
 *  one fill per colour word, no image hosting. `det` layers are the seams,
 *  collars and soles that make a shape read as a garment.
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
  taupe: "#a68f7b",
  camel: "#b98d5f",
  cream: "#e6dcc8",
  pink: "#dda0ae",
  purple: "#7c6aa8",
  yellow: "#e0b64a",
  emerald: "#3d7a5e",
};

export function colourOf(colour: string): string {
  return FILL[colour.toLowerCase().trim()] ?? "#8f9aa8";
}

/* d = silhouette, det = darker seam/detail layer, lite = pale layer. */
const SHAPES: Record<string, { d: string; det?: string; lite?: string }> = {
  tee: {
    d: "M34 14 h20 l13 7 -6 12 -7 -4 v29 h-20 v-29 l-7 4 -6 -12 z",
    det: "M39 14 h10 c0 3 -10 3 -10 0 z",
  },
  crewneck: {
    d: "M34 14 h20 l13 7 -6 12 -7 -4 v29 h-20 v-29 l-7 4 -6 -12 z",
    det: "M39 14 h10 c0 3 -10 3 -10 0 z M34 52 h20 v6 h-20 z",
  },
  hoodie: {
    d: "M34 14 h20 l13 7 -6 12 -7 -4 v29 h-20 v-29 l-7 4 -6 -12 z",
    det: "M37 14 c0 -7 3 -11 7 -11 s7 4 7 11 c-4 -3 -10 -3 -14 0 z M37 46 h14 l3 5 v7 h-20 v-7 z",
  },
  tank: {
    d: "M38 12 h4 l2 11 h1 l2 -11 h4 l9 12 -5 6 v28 h-27 v-28 l-5 -6 z",
  },
  cami: {
    d: "M39 12 h3 l3 12 3 -12 h3 l8 12 -5 7 v27 h-26 v-27 l-5 -7 z",
  },
  sports_bra: {
    d: "M39 12 h3 l3 12 3 -12 h3 l8 12 -5 7 v15 h-26 v-15 l-5 -7 z",
    det: "M28 40 h26 v4 h-26 z",
  },
  trousers: {
    d: "M31 12 h26 v9 l2 33 h-11 l-4 -31 -4 31 h-11 l2 -33 z",
    det: "M31 12 h26 v5 h-26 z",
  },
  sweatpants: {
    d: "M31 12 h26 v9 l2 33 h-11 l-4 -31 -4 31 h-11 l2 -33 z",
    det: "M31 12 h26 v5 h-26 z M29 48 h11 v5 h-11 z M48 48 h11 v5 h-11 z",
  },
  leggings: {
    d: "M33 12 h22 v9 l1 33 h-10 l-2 -31 -2 31 h-10 l1 -33 z",
    det: "M33 12 h22 v5 h-22 z",
  },
  shorts: {
    d: "M31 12 h26 v9 l2 21 h-11 l-4 -19 -4 19 h-11 l2 -21 z",
    det: "M31 12 h26 v5 h-26 z",
  },
  skirt: {
    d: "M33 14 h22 l9 38 h-40 z",
    det: "M33 14 h22 v5 h-22 z",
  },
  dress: {
    d: "M36 12 h4 l3 9 h2 l3 -9 h4 l7 9 -4 6 c3 8 7 20 9 32 h-40 c2 -12 6 -24 9 -32 l-4 -6 z",
  },
  jacket: {
    d: "M34 14 h20 l13 7 -6 12 -7 -4 v29 h-20 v-29 l-7 4 -6 -12 z",
    det: "M38 14 l6 9 h1 l6 -9 z M43 23 h2 v35 h-2 z",
  },
  raincoat: {
    d: "M34 14 h20 l13 7 -6 12 -7 -4 v29 h-20 v-29 l-7 4 -6 -12 z",
    det: "M36 14 c0 -8 4 -12 8 -12 s8 4 8 12 c-4 -3 -12 -3 -16 0 z M43 23 h2 v35 h-2 z",
  },
  puffer: {
    d: "M34 14 h20 l13 7 -6 12 -7 -4 v29 h-20 v-29 l-7 4 -6 -12 z",
    det: "M36 14 c0 -5 3 -8 8 -8 s8 3 8 8 c-4 -2 -12 -2 -16 0 z M34 34 h20 v2.5 h-20 z M34 42 h20 v2.5 h-20 z M34 50 h20 v2.5 h-20 z",
  },
  blazer: {
    d: "M34 14 h20 l13 7 -6 12 -7 -4 v29 h-20 v-29 l-7 4 -6 -12 z",
    det: "M34 14 h6 l4 16 -10 -4 z M54 14 h-6 l-4 16 10 -4 z M44 42 a2 2 0 1 1 0 4 a2 2 0 1 1 0 -4 z",
    lite: "M40 14 h8 l-4 16 z",
  },
  sneakers: {
    d: "M14 40 v-6 c0 -4 3 -6 7 -6 h5 c5 0 10 2 14 6 l9 8 h14 c8 0 12 4 12 9 v6 h-61 z",
    det: "M29 30 l8 5 -2 3 -8 -5 z M35 35 l8 5 -2 3 -8 -5 z",
    lite: "M14 51 h61 v6 h-61 z",
  },
  boots: {
    d: "M29 11 h21 v25 c6 3 12 7 15 12 l7 7 c3 5 0 11 -6 11 H29 z",
    det: "M44 20 h6 v14 h-6 z M32 7 h4 v5 h-4 z M29 61 h41 v5 h-41 z",
  },
  rain_boots: {
    d: "M27 8 h24 v28 c6 3 11 7 15 12 l7 7 c3 5 0 11 -6 11 H27 z",
    det: "M27 8 h24 v4 h-24 z M27 61 h43 v5 h-43 z",
  },
  heels: {
    d: "M28 32 c4 -3 10 -3 14 0 l20 18 c5 4 4 13 -3 13 h-7 l-1 -16 -15 -8 -2 22 h-6 z",
  },
  scarf: {
    d: "M30 14 h28 c4 0 6 2 6 5 v5 h-16 v30 h-10 v-30 h-14 v-5 c0 -3 2 -5 6 -5 z",
    det: "M38 54 h2.5 v7 h-2.5 z M41.75 54 h2.5 v7 h-2.5 z M45.5 54 h2.5 v7 h-2.5 z",
  },
  beanie: {
    d: "M24 44 c0 -14 8 -22 20 -22 s20 8 20 22 v6 h-40 z",
    det: "M24 44 h40 v6 h-40 z",
    lite: "M44 14 a5 5 0 1 1 0 10 a5 5 0 1 1 0 -10 z",
  },
};

const KIND: Record<string, string> = {
  crewneck: "crewneck",
  hoodie: "hoodie",
  going_out_top: "cami",
  sports_bra: "sports_bra",
  athletic_top: "tee",
  tank: "tank",
  jeans: "trousers",
  sweatpants: "sweatpants",
  leggings: "leggings",
  skirt: "skirt",
  athletic_shorts: "shorts",
  going_out_dress: "dress",
  puffer: "puffer",
  light_jacket: "jacket",
  rain_outer: "raincoat",
  blazer: "blazer",
  formal: "blazer",
  sneakers: "sneakers",
  boots: "boots",
  rain_boots: "rain_boots",
  heels: "heels",
  scarf: "scarf",
};

const CATEGORY: Record<string, string> = {
  top: "tee",
  bottom: "trousers",
  dress: "dress",
  outer: "jacket",
  shoes: "sneakers",
  accessory: "beanie",
};

const TITLE_KINDS: [RegExp, string][] = [
  [/rain boot|wellie/, "rain_boots"],
  [/boot/, "boots"],
  [/heel|pump|stiletto/, "heels"],
  [/sneaker|trainer|runner/, "sneakers"],
  [/hoodie/, "hoodie"],
  [/crewneck|sweatshirt|jumper/, "crewneck"],
  [/sports bra/, "sports_bra"],
  [/tank/, "tank"],
  [/jean|trouser|chino/, "trousers"],
  [/sweatpant|jogger/, "sweatpants"],
  [/legging/, "leggings"],
  [/short/, "shorts"],
  [/skirt/, "skirt"],
  [/dress|gown/, "dress"],
  [/puffer|parka/, "puffer"],
  [/rain|trench|coat/, "raincoat"],
  [/blazer|suit|tuxedo/, "blazer"],
  [/scarf/, "scarf"],
  [/beanie|hat|cap/, "beanie"],
];

export function kindGuess(title: string): string | undefined {
  const t = title.toLowerCase();
  for (const [re, k] of TITLE_KINDS) if (re.test(t)) return k;
  return undefined;
}

export function garmentShape(category: string, kind?: string) {
  const key = (kind && KIND[kind]) || CATEGORY[category] || "beanie";
  return SHAPES[key] ?? SHAPES.beanie;
}

export function Garment({ category, colour, kind, size = 88 }: { category: string; colour: string; kind?: string; size?: number }) {
  const shape = garmentShape(category, kind);
  return (
    <svg viewBox="0 0 88 72" width={size} height={(size * 72) / 88} role="img" aria-label={kind || category}>
      <path d={shape.d} fill={colourOf(colour)} />
      <path d={shape.d} fill="none" stroke="#2c2a24" strokeOpacity="0.22" strokeWidth="1.5" strokeLinejoin="round" />
      {shape.det && <path d={shape.det} fill="#000" opacity="0.2" />}
      {shape.lite && <path d={shape.lite} fill="#fff" opacity="0.6" />}
    </svg>
  );
}
