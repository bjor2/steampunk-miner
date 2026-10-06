/**
 * The drawings of the icon set (#158 "Drawing style"): each glyph is one silhouette (`body`, a
 * path that must pass as a solid fill at 16 px), at most three engraved interior `lines` and a few
 * `dots` (rivets, sparks, eyes), all on a 24 grid. The composer (`iconSvg.ts`) sets the colours and
 * fits the glyph into its frame, so a glyph knows nothing about brass or plates. Several ids may
 * share one glyph: the HUD's guns label draws the gun track's drawing with no frame.
 */
export interface IconGlyph {
  /** The silhouette, an SVG path on the 24 grid. */
  body: string
  /** Up to three engraved lines, one SVG path, stroked. */
  lines?: string
  /** Rivets, sparks and eyes: `[x, y, radius]`. */
  dots?: readonly (readonly [number, number, number])[]
}

/** A ring: the outer circle and the inner one wound the other way (`fill-rule: evenodd`). */
const RING = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zm0 4a5 5 0 1 1 0 10a5 5 0 1 1 0-10z'

const DIAL = 'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20z'

const CRATE = 'M3 10h18v11H3z'

const PLATE = 'M3 4h18v16H3z'

const CHARGE = 'M6 9h12v12H6z'

const THERMOMETER = 'M10 3a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z'

const SCALE =
  'M11 3h2v16h-2zM3 5h18v2H3zM6 19h12v2H6zM1 8h10a5 5 0 0 1-10 0zM13 8h10a5 5 0 0 1-10 0z'

const ALEMBIC = 'M9 2h6v2h-1v5l6 9a2 2 0 0 1-2 3H6a2 2 0 0 1-2-3l6-9V4H9z'

const WRENCH = 'M15 2a6 6 0 0 0-5 9L3 18l3 3 7-7a6 6 0 0 0 9-5l-3 3-3-1-1-3 3-3z'

const BOLT = 'M13 2L5 13h6l-2 9 8-12h-6z'

const FURNACE = 'M4 21V9a8 8 0 0 1 16 0v12z'

const GUN = 'M3 10h11l2-3h5v4l-3 2v4H6l-3-2z'

const STAR = 'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'

const COIN = DIAL

const CARGO_HOLD = 'M3 8l9-5 9 5v10l-9 5-9-5z'

const SETTINGS_GEAR =
  'M10 2h4l.6 3 2.1 1.2 2.8-1.2 2 3.5-2.3 1.9v2.6l2.3 1.9-2 3.5-2.8-1.2L14.6 19 14 22h-4l-.6-3-2.1-1.2-2.8 1.2-2-3.5 2.3-1.9v-2.6L2.5 8.1l2-3.5 2.8 1.2L9.4 5z' +
  'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z'

/** The plate's four rivets, inset from its edges (`PLATE` spans 3..21 by 4..20). */
const RIVET_INSET = 2.5

const RIVETS: IconGlyph['dots'] = [3 + RIVET_INSET, 21 - RIVET_INSET].flatMap((x) =>
  [4 + RIVET_INSET, 20 - RIVET_INSET].map((y): readonly [number, number, number] => [x, y, 1]),
)

const CORE_FRAGMENT: IconGlyph = {
  body: 'M12 3l7 5v8l-7 5-7-5V8z',
  lines: 'M12 8v8M8.5 10l7 4M15.5 10l-7 4',
}

const GLYPHS: Readonly<Record<string, IconGlyph>> = {
  // Upgrade tracks (#7): the part the track grows.
  'drill-power': { body: 'M8 2h8v9l-4 11-4-11z', lines: 'M8.8 7h6.4M9.6 10.5h4.8M10.4 14h3.2' },
  'drill-tip': { body: 'M12 1l5 7-5 15-5-15z', lines: 'M7 8h10M9 12h6' },
  engine: { body: 'M4 8h16v9H4zM9 2h6v6H9zM10 17h4v5h-4z', lines: 'M7 11h10M7 14h10' },
  boiler: {
    body: 'M5 8a7 7 0 0 1 14 0v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
    lines: 'M8 13h8M9 5c0-2 2-2 2-4M14 5c0-2 2-2 2-4',
    dots: [
      [8, 17, 0.9],
      [16, 17, 0.9],
    ],
  },
  'cargo-hold': { body: CARGO_HOLD, lines: 'M3 8l9 5 9-5M12 13v10' },
  hull: { body: 'M12 2l9 3v8c0 5-4 8-9 10-5-2-9-5-9-10V5z', lines: 'M12 6v12' },
  // The casing grade, the lining type, the guns and the charges (#41, #113, #107, #109).
  casing: {
    body: RING,
    dots: [
      [12, 5, 1],
      [12, 19, 1],
      [5, 12, 1],
      [19, 12, 1],
    ],
  },
  'refractory-lining': { body: RING, lines: 'M12 3v4M12 17v4M3 12h4M17 12h4' },
  gun: { body: GUN, lines: 'M14 7l2-3M6 14h8' },
  charge: { body: CHARGE, lines: 'M12 9V5c0-2 3-2 3-4M8 13h8', dots: [[15.5, 1.5, 1.2]] },
  'charge-rack': { body: 'M3 10h18v11H3z', lines: 'M9 10v11M15 10v11M3 15h18' },
  furnace: { body: FURNACE, lines: 'M9 21v-6h6v6M12 10c-2 2 1 3 0 5' },
  // The artefacts (#46), horizontal power-ups.
  'ore-whisper': {
    body: 'M2 12c4-6 16-6 20 0c-4 6-16 6-20 0z',
    lines: 'M12 5V2M7 6L5 3M17 6l2-3',
    dots: [[12, 12, 2.5]],
  },
  'breathing-room': {
    body: 'M4 20V10a8 8 0 0 1 16 0v10h-4V10a4 4 0 0 0-8 0v10z',
    lines: 'M4 16h4M16 16h4',
  },
  'assay-beacon': {
    body: 'M9 10a3 3 0 1 1 6 0v7H9zM7 17h10v3H7z',
    lines: 'M12 2v4M5 5l2 2M19 5l-2 2',
  },
  'core-fragment': CORE_FRAGMENT,
  // The six combat statuses, then the two secondary ones (#158 "Combat statuses").
  'status-hull-critical': { body: PLATE, lines: 'M9 4l3 6-2 4 3 6', dots: RIVETS },
  'status-collapse': {
    body: 'M4 5h16v3H4zM6 10h12v3H6zM8 15h8v3H8z',
    dots: [
      [5, 21, 1],
      [12, 21, 1],
      [19, 21, 1],
    ],
  },
  'status-fuse': { body: CHARGE, lines: 'M12 9V6c0-2 3-2 3-4', dots: [[15.5, 1.8, 1.8]] },
  'status-overheat': { body: `${THERMOMETER}M18 11c-3 3 1 5 0 8c3-2 3-6 0-8z`, lines: 'M12 7v9' },
  'status-low-energy': { body: DIAL, lines: 'M12 12l-5 3M12 5v2M19 12h-2', dots: [[12, 12, 1.5]] },
  'status-threat': { body: 'M12 3l9 9h-5v9h-8v-9H3z', lines: 'M12 8v9' },
  'status-cargo-full': { body: `${CRATE}M7 10l3-5 3 5zM12 10l3-4 3 4z`, lines: 'M3 14h18' },
  'status-tow': {
    body: 'M8 2h6v9a3 3 0 0 0 6 0v-1h3v1a6 6 0 0 1-12 0V5H8z',
    dots: [
      [5, 16, 1.6],
      [7, 20, 1.6],
    ],
  },
  // The enemies (#9, #111), on the threat arrows.
  'enemy-crawler': {
    body: 'M12 6a6 8 0 1 1 0 16a6 8 0 1 1 0-16z',
    lines: 'M6 10l-4-2M6 14H2M6 18l-4 2M18 10l4-2M18 14h4M18 18l4 2',
    dots: [
      [9, 5, 1.2],
      [15, 5, 1.2],
    ],
  },
  'enemy-burrower': {
    body: 'M4 16c0-6 4-10 8-10s8 4 8 10z',
    lines: 'M3 20h4M9 20h6M17 20h4',
    dots: [
      [9, 12, 1.1],
      [15, 12, 1.1],
    ],
  },
  'enemy-tunnel-wrecker': {
    body: 'M3 16a9 9 0 0 1 18 0h-2l-1 4-1-4h-2l-1 4-1-4h-2l-1 4-1-4H7l-1 4-1-4z',
    lines: 'M8 11h8',
    dots: [
      [9, 9, 1.1],
      [15, 9, 1.1],
    ],
  },
  // The vehicle's states (#33 section 5).
  'state-docked': {
    body: 'M12 1.5a3 3 0 1 1 0 6a3 3 0 0 1 0-6zM10.5 7.5h3v10a6 6 0 0 0 4.5-4.5h3.5a9.5 9.5 0 0 1-19 0H6a6 6 0 0 0 4.5 4.5zM7 9.5h10v2H7z',
  },
  'state-active': {
    body: `${RING}M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z`,
    lines: 'M12 5v4M12 15v4M5 12h4M15 12h4',
  },
  'state-stranded': {
    body: 'M4 8h16v10H4zM8 8V5h8v3h-2V7h-4v1z',
    lines: 'M7 15h3M12 15h2M16 15h1',
  },
  'state-destroyed': { body: SETTINGS_GEAR, lines: 'M12 12l5-6M9 20l2-5' },
  // The HUD gauges (#158: a pressure dial, a riveted plate, an ore crate) and the heat gauge.
  'gauge-energy': { body: DIAL, lines: 'M12 12l5-5M5 12h2M12 5v2M19 12h-2', dots: [[12, 12, 1.5]] },
  'gauge-hull': { body: PLATE, lines: 'M3 12h18', dots: RIVETS },
  'gauge-cargo': { body: `${CRATE}M7 10l3-4 3 4zM12 10l3-3 3 3z`, lines: 'M3 14h18' },
  'gauge-core-bay': {
    body: 'M12 6a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM11 1h2v3h-2zM11 20h2v3h-2zM1 11h3v2H1zM20 11h3v2h-3z',
    lines: 'M9 12a3 3 0 0 1 6 0',
  },
  heat: { body: THERMOMETER, lines: 'M12 7v9M7 6h2M7 10h2' },
  // The HUD's readouts.
  'hud-depth': { body: 'M9 2h6v10h4l-7 7-7-7h4z', lines: 'M3 22h18' },
  'hud-compass': { body: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z', dots: [[12, 12, 1.5]] },
  'hud-core': { body: `${RING}M12 9.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5z` },
  'hud-tile-time': { body: 'M6 2h12v2l-5 8 5 8v2H6v-2l5-8-5-8z', lines: 'M8 4h8M8 20h8' },
  'hud-casing': {
    body: RING,
    dots: [
      [12, 5, 1],
      [12, 19, 1],
      [5, 12, 1],
      [19, 12, 1],
    ],
  },
  'hud-guns': { body: GUN, lines: 'M14 7l2-3M6 14h8' },
  'hud-charges': { body: CHARGE, lines: 'M12 9V5c0-2 3-2 3-4M8 13h8', dots: [[15.5, 1.5, 1.2]] },
  'hud-cargo-value': {
    body: 'M4 6a8 2.5 0 1 1 16 0v12a8 2.5 0 1 1-16 0z',
    lines: 'M4 10a8 2.5 0 0 0 16 0M4 14a8 2.5 0 0 0 16 0',
  },
  'hud-lining-bill': { body: 'M5 3h14v18H5z', lines: 'M8 8h8M8 12h8M8 16h5' },
  'hud-money': { body: COIN, lines: 'M12 6a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM12 9v6' },
  'hud-planet': { body: 'M12 5a7 7 0 1 1 0 14a7 7 0 1 1 0-14z', lines: 'M2 14c4 4 16 4 20 0' },
  // The platform's two looks (#8), the preview's tier, the plaques.
  'platform-outpost': { body: 'M4 21V11l8-7 8 7v10z', lines: 'M10 21v-6h4v6' },
  'platform-core-drive': {
    body: 'M12 2c4 4 5 10 3 16H9C7 12 8 6 12 2zM9 18l-3 4h12l-3-4z',
    lines: 'M12 8v6',
  },
  'tier-star': { body: STAR },
  hint: {
    body: 'M3 6h18v12H3z',
    lines: 'M6 10h12M6 14h8',
    dots: [
      [5, 8, 0.8],
      [19, 8, 0.8],
      [5, 16, 0.8],
      [19, 16, 0.8],
    ],
  },
  transmission: {
    body: 'M10 22l2-12 2 12z',
    lines: 'M6 8a8 8 0 0 1 12 0M8 10.5a5 5 0 0 1 8 0',
    dots: [[12, 7, 1.4]],
  },
  // The bay panels.
  'panel-shop': { body: SCALE, lines: 'M3 5h18' },
  'panel-refined': { body: 'M4 17l3-8h10l3 8z', lines: 'M8 13h8' },
  'panel-charging': { body: BOLT },
  'panel-lining': { body: 'M5 3h14v18H5z', lines: 'M8 8h8M8 12h8M8 16h5' },
  'panel-hold': { body: CARGO_HOLD, lines: 'M3 8l9 5 9-5M12 13v10' },
  'panel-slots': { body: FURNACE, lines: 'M9 21v-6h6v6M12 10c-2 2 1 3 0 5' },
  'panel-upgrades': { body: WRENCH },
  'panel-settings': { body: SETTINGS_GEAR },
  'panel-cache': { body: 'M3 10h18v11H3zM4 9V7a8 4 0 0 1 16 0v2z', lines: 'M3 14h18M12 14v3' },
  // The buttons.
  'button-travel': { body: 'M12 2l7 10h-4v10h-6V12H5z', lines: 'M9 16h6' },
  'button-undock': { body: 'M3 3h10v3H6v12h7v3H3zM12 8l6 4-6 4v-3H9v-2h3z' },
  'button-repair': { body: 'M3 19l9-9 2 2-9 9zM13 3l8 8-3 3-8-8z', lines: 'M14 6l4 4' },
  'button-recharge': { body: BOLT },
  'button-sell': { body: COIN, lines: 'M12 6a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM9 12h6M13 10l2 2-2 2' },
  'button-collect': { body: 'M3 9h18l-2 12H5z', lines: 'M8 9V6a4 4 0 0 1 8 0v3M9 13v5M15 13v5' },
  'button-refine': { body: ALEMBIC, lines: 'M8 16h8' },
  'button-quick-service': { body: WRENCH, lines: 'M14 4l2 2' },
  // The settings (#33 section 3).
  'setting-camera-mode': {
    body: 'M4 7h5l2-3h2l2 3h5v12H4z',
    lines: 'M12 10a3 3 0 1 1 0 6a3 3 0 0 1 0-6z',
  },
  'setting-shake': {
    body: 'M8 8h8v8H8z',
    lines: 'M3 6l2 2-2 2M21 6l-2 2 2 2M3 14l2 2-2 2M21 14l-2 2 2 2',
  },
  'setting-flashes': {
    body: 'M12 6a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM11 1h2v3h-2zM11 20h2v3h-2zM1 11h3v2H1zM20 11h3v2h-3zM3.5 4.9l1.4-1.4 2.1 2.1-1.4 1.4zM17 18.4l1.4-1.4 2.1 2.1-1.4 1.4z',
  },
  'setting-hints-enabled': { body: 'M3 4h18v12h-9l-5 4v-4H3z', lines: 'M7 8h10M7 11h7' },
  'setting-music-muted': { body: 'M14 3v12a3 3 0 1 1-2-2.8V3z', lines: 'M14 3l6 2v3l-6-2' },
  'setting-music-volume': {
    body: 'M3 9h4l6-5v16l-6-5H3z',
    lines: 'M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  },
  // The device settings (#173): a TV set, a mirror axis, a buzzing handset.
  'setting-tv-mode': { body: 'M2 6h20v13H2zM7 20h10v2H7z', lines: 'M8 2l4 4 4-4M5 9h14' },
  'setting-left-handed': { body: 'M11 2h2v20h-2zM9 12L3 7v10zM15 12l6-5v10z' },
  'setting-haptics': { body: 'M8 3h8v18H8z', lines: 'M4 8v8M20 8v8M11 18h2' },
  // The bay emblems (#45): assay scale, gear, alembic.
  'emblem-sell': { body: SCALE, lines: 'M3 5h18' },
  'emblem-upgrade': { body: SETTINGS_GEAR },
  'emblem-refinery': { body: ALEMBIC, lines: 'M8 16h8' },
}

export function glyphOf(key: string): IconGlyph | null {
  return GLYPHS[key] ?? null
}

export function glyphKeys(): string[] {
  return Object.keys(GLYPHS)
}
