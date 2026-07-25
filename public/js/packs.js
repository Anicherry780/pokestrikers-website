// Pokémon TCG sets grouped by series, newest series and newest set first.
// Used by the claim picker, the upload dropdown and the follow list so all three
// stay in the same order. Admin-added sets are merged in at runtime (/api/sets).
const POKE_SERIES = [
  {
    name: "Mega Evolution",
    sets: [
      "Pitch Black",
      "Chaos Rising",
      "Perfect Order",
      "Ascended Heroes",
      "Phantasmal Flames",
      "Mega Evolution",
    ],
  },
  {
    name: "Scarlet & Violet",
    sets: [
      "Black Bolt",
      "White Flare",
      "Destined Rivals",
      "Journey Together",
      "Prismatic Evolutions",
      "Surging Sparks",
      "Stellar Crown",
      "Shrouded Fable",
      "Twilight Masquerade",
      "Temporal Forces",
      "Paldean Fates",
      "Paradox Rift",
      "Pokémon 151",
      "Obsidian Flames",
      "Paldea Evolved",
      "Scarlet & Violet Base",
    ],
  },
  {
    name: "Sword & Shield",
    sets: [
      "Crown Zenith",
      "Silver Tempest",
      "Lost Origin",
      "Astral Radiance",
      "Brilliant Stars",
      "Fusion Strike",
      "Evolving Skies",
      "Chilling Reign",
      "Battle Styles",
      "Shining Fates",
      "Vivid Voltage",
      "Champion's Path",
      "Darkness Ablaze",
      "Rebel Clash",
      "Sword & Shield Base",
      "VSTAR Universe",
    ],
  },
];

// Anything that isn't a numbered expansion — tins, ETBs, promo bundles, and
// whatever people type by hand — collects here so it still shows up.
const OTHER_SERIES = "Promos & other";

// Flat list, kept for anything that just wants every known set name.
const POKE_PACKS = POKE_SERIES.flatMap((s) => s.sets);

// Which series a pack name belongs to. Falls back to "Promos & other" so an
// unrecognised name is never dropped from a list.
function seriesFor(packName, extraSets) {
  const key = String(packName || "").trim().toLowerCase();
  for (const s of POKE_SERIES) {
    if (s.sets.some((n) => n.toLowerCase() === key)) return s.name;
  }
  const extra = (extraSets || []).find((e) => String(e.name).toLowerCase() === key);
  if (extra && extra.series) return extra.series;
  return OTHER_SERIES;
}

// Group a list of pack names into series order for rendering.
// `items` may be plain strings or objects carrying a `pack_name`.
function groupBySeries(items, extraSets) {
  const nameOf = (i) => (typeof i === "string" ? i : i.pack_name);
  const order = [...POKE_SERIES.map((s) => s.name), OTHER_SERIES];
  const buckets = new Map(order.map((n) => [n, []]));

  for (const item of items) {
    const series = seriesFor(nameOf(item), extraSets);
    if (!buckets.has(series)) buckets.set(series, []);
    buckets.get(series).push(item);
  }

  // Preserve each series' canonical set order where we know it.
  for (const s of POKE_SERIES) {
    const bucket = buckets.get(s.name);
    if (!bucket) continue;
    const rank = new Map(s.sets.map((n, i) => [n.toLowerCase(), i]));
    bucket.sort((a, b) =>
      (rank.get(String(nameOf(a)).toLowerCase()) ?? 999) -
      (rank.get(String(nameOf(b)).toLowerCase()) ?? 999));
  }

  return [...buckets.entries()]
    .filter(([, list]) => list.length)
    .map(([name, list]) => ({ series: name, items: list }));
}
