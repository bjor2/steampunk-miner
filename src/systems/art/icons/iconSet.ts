/**
 * The icon set (#158 "Icon language", built by #163): every vector icon the UI draws, with the
 * frame that says what kind of thing it is and the colour axis that says why it matters.
 *
 * - The frame is read before the glyph: a riveted plate for a buyable item, a gear rim for a tech
 *   node or power-up, a hex for a resource, a triangle for a warning or status, no frame for a HUD
 *   gauge or label.
 * - Colour means axis, never state: brass for a vertical stat track, verdigris for a horizontal
 *   capability, orange and red only for heat, danger and enemies; chrome stays neutral.
 *
 * Every id is derived from its registry id in the #52 kebab form, so an icon cannot drift from the
 * code. Ore icons are generated from the ore look (`oreIcon.ts`) and are not files, so they are
 * not here. The shipped SVGs are written from this set by `npm run art:icons`.
 */
import { GUN_TRACK_ID } from '../../economy/gunStats'
import { PREFERENCE_NAMES, type PreferenceName } from '../../input/preferences'
import { ARTEFACT_IDS, ENEMY_IDS, PLATFORM_BAY_IDS, UPGRADE_IDS } from '../../registeredIds'
import { VEHICLE_MODES, type VehicleMode } from '../../vehicle/vehicleState'
import { kebabOf, kebabOfCamel } from '../artNaming'
import {
  BLASTING_CHARGES_ROW_ID,
  HEAT_LAVA_ROW_ID,
  REFRACTORY_LINING_ROW_ID,
} from '../moduleRowIds'

export const ICON_FRAMES = ['plate', 'gear', 'hex', 'triangle', 'none'] as const

/** What kind of thing the icon stands for; the frame shape says it before the glyph does. */
export type IconFrame = (typeof ICON_FRAMES)[number]

export const ICON_AXES = ['brass', 'verdigris', 'warning', 'neutral'] as const

/** Why the thing matters: a stat track, a new capability, a danger, or plain chrome. */
export type IconAxis = (typeof ICON_AXES)[number]

export interface IconEntry {
  id: string
  frame: IconFrame
  axis: IconAxis
  /** The `<title>` of the SVG; what the thing is called on screen. */
  title: string
  /** The drawing, a key of `iconGlyphs.ts`; several ids may share one (a HUD label and its row). */
  glyph: string
}

/** The six combat statuses, in the priority they show in (#158 "Combat statuses"). */
export const COMBAT_STATUS_IDS = [
  'hull_critical',
  'collapse',
  'fuse',
  'overheat',
  'low_energy',
  'threat',
] as const

export type CombatStatusId = (typeof COMBAT_STATUS_IDS)[number]

/** The secondary statuses, a 24 px triangle read between fights. */
export const SECONDARY_STATUS_IDS = ['cargo_full', 'tow'] as const

export type SecondaryStatusId = (typeof SECONDARY_STATUS_IDS)[number]

/** The HUD gauges with a glyph of their own: a riveted plate, a pressure dial, an ore crate. */
export const GAUGE_IDS = ['energy', 'hull', 'cargo', 'core_bay'] as const

export type GaugeId = (typeof GAUGE_IDS)[number]

/** The HUD's readouts beside the gauges, each with a plain label glyph. */
export const HUD_LABEL_IDS = [
  'depth',
  'compass',
  'core',
  'tile_time',
  'casing',
  'guns',
  'charges',
  'cargo_value',
  'lining_bill',
  'money',
  'planet',
] as const

export type HudLabelId = (typeof HUD_LABEL_IDS)[number]

/** The bay screens' panels, each titled with a glyph. */
export const PANEL_IDS = [
  'shop',
  'refined',
  'charging',
  'lining',
  'hold',
  'slots',
  'upgrades',
  'settings',
  'cache',
] as const

export type PanelId = (typeof PANEL_IDS)[number]

/** The buttons that carry a glyph beside their label. */
export const BUTTON_ICON_IDS = [
  'travel',
  'undock',
  'repair',
  'recharge',
  'sell',
  'collect',
  'refine',
  'quick_service',
] as const

export type ButtonIconId = (typeof BUTTON_ICON_IDS)[number]

/** An upgrade track's icon (#44 `icon-track-<id>`, in the #52 kebab form of the registry id). */
export function trackIconIdOf(track: string): string {
  return `icon-track-${kebabOf(track)}`
}

/** The Casing row's icon, the seventh vector icon (#54 scope review). */
export const CASING_ICON_ID = 'icon-casing'

/** The Guns row's icon: the gun track in the `icon-track-<id>` family (#107, #108). */
export const GUN_ICON_ID = trackIconIdOf(GUN_TRACK_ID)

export const BLASTING_CHARGES_ICON_ID = `icon-${kebabOf(BLASTING_CHARGES_ROW_ID)}`

/** The Rack row's own icon: the rack the charges sit in, not a charge. */
export const CHARGE_RACK_ICON_ID = 'icon-charge-rack'

/** The HUD heat gauge's icon. */
export const HEAT_GAUGE_ICON_ID = `icon-${kebabOf(HEAT_LAVA_ROW_ID)}`

/** The refractory lining type's row in the Upgrade bay. */
export const REFRACTORY_LINING_ICON_ID = `icon-${kebabOf(REFRACTORY_LINING_ROW_ID)}`

/** The Refinery bay's slot row and its Buy slot. */
export const REFINERY_SLOT_ICON_ID = 'icon-refinery-slot'

/** The core bay's fragments, a resource that is never sold (#10). */
export const CORE_FRAGMENT_ICON_ID = 'icon-core-fragment'

/** The Upgrade bay preview's tier gauge. */
export const PREVIEW_TIER_ICON_ID = 'icon-preview-tier'

export const HINT_PLAQUE_ICON_ID = 'icon-hint'

export const TRANSMISSION_ICON_ID = 'icon-transmission'

/** The two platform looks of #8, `outpost` and `core_drive`. */
export function platformStateIconIdOf(visualState: string): string {
  return `icon-platform-${kebabOf(visualState)}`
}

export function vehicleStateIconIdOf(mode: VehicleMode): string {
  return `icon-state-${kebabOf(mode)}`
}

export function combatStatusIconIdOf(status: CombatStatusId | SecondaryStatusId): string {
  return `icon-status-${kebabOf(status)}`
}

/** The threat arrows carry the enemy family's icon (#158). */
export function enemyIconIdOf(kind: string): string {
  return `icon-enemy-${kebabOf(kind)}`
}

/** `artefact.ore_whisper` draws as `icon-artefact-ore-whisper`. */
export function artefactIconIdOf(artefactId: string): string {
  return `icon-artefact-${kebabOf(artefactId.replace(/^artefact\./, ''))}`
}

export function bayEmblemIdOf(bay: string): string {
  return `emblem-bay-${bay}`
}

export function gaugeIconIdOf(gauge: GaugeId): string {
  return `icon-gauge-${kebabOf(gauge)}`
}

export function hudLabelIconIdOf(label: HudLabelId): string {
  return `icon-hud-${kebabOf(label)}`
}

export function panelIconIdOf(panel: PanelId): string {
  return `icon-panel-${kebabOf(panel)}`
}

export function buttonIconIdOf(button: ButtonIconId): string {
  return `icon-${kebabOf(button)}`
}

export function settingIconIdOf(name: PreferenceName): string {
  return `icon-setting-${kebabOfCamel(name)}`
}

const TRACK_TITLES: Readonly<Record<string, string>> = {
  drill_power: 'Drill power',
  drill_tip: 'Drill tip',
  engine: 'Engine',
  boiler: 'Boiler',
  cargo_hold: 'Cargo hold',
  hull: 'Hull',
}

const STATUS_TITLES: Readonly<Record<CombatStatusId | SecondaryStatusId, string>> = {
  hull_critical: 'Hull critical',
  collapse: 'Collapse warning',
  fuse: 'Live charge fuse',
  overheat: 'Overheat',
  low_energy: 'Low energy',
  threat: 'Threat direction',
  cargo_full: 'Cargo full',
  tow: 'Tow countdown',
}

const MODE_TITLES: Readonly<Record<VehicleMode, string>> = {
  docked: 'Docked',
  active: 'Under way',
  stranded: 'Stranded',
  destroyed: 'Wrecked',
}

const GAUGE_TITLES: Readonly<Record<GaugeId, string>> = {
  energy: 'Energy',
  hull: 'Hull',
  cargo: 'Cargo',
  core_bay: 'Core bay',
}

const HUD_LABEL_TITLES: Readonly<Record<HudLabelId, string>> = {
  depth: 'Depth',
  compass: 'Dock',
  core: 'Core',
  tile_time: 'Tile',
  casing: 'Casing',
  guns: 'Guns',
  charges: 'Charges',
  cargo_value: 'Cargo value',
  lining_bill: 'Lining bill',
  money: 'Money',
  planet: 'Planet',
}

const PANEL_TITLES: Readonly<Record<PanelId, string>> = {
  shop: 'Shop',
  refined: 'Refined',
  charging: 'Charging',
  lining: 'Lining bill',
  hold: 'Hold',
  slots: 'Slots',
  upgrades: 'Upgrades',
  settings: 'Settings',
  cache: 'Ancient cache',
}

const BUTTON_TITLES: Readonly<Record<ButtonIconId, string>> = {
  travel: 'Travel',
  undock: 'Undock',
  repair: 'Repair',
  recharge: 'Recharge',
  sell: 'Sell',
  collect: 'Collect',
  refine: 'Refine',
  quick_service: 'Sell, repair and recharge',
}

const SETTING_TITLES: Readonly<Record<PreferenceName, string>> = {
  cameraMode: 'Camera',
  shake: 'Screen shake',
  flashes: 'Flashes',
  hintsEnabled: 'Show hints',
  musicMuted: 'Music',
  musicVolume: 'Music volume',
}

const ARTEFACT_TITLES: Readonly<Record<string, string>> = {
  'artefact.ore_whisper': 'Ore Whisper',
  'artefact.breathing_room': 'Breathing Room',
  'artefact.assay_beacon': 'Assay Beacon',
}

const ENEMY_TITLES: Readonly<Record<string, string>> = {
  crawler: 'Crawler',
  burrower: 'Burrower',
  tunnel_wrecker: 'Tunnel wrecker',
}

const BAY_TITLES: Readonly<Record<string, string>> = {
  sell: 'Sell bay',
  upgrade: 'Upgrade bay',
  refinery: 'Refinery bay',
}

/** Every file icon of the set, in contact-sheet order: plates, gears, hexes, triangles, labels. */
export function iconEntries(): IconEntry[] {
  return [
    ...buyableEntries(),
    ...artefactEntries(),
    {
      id: CORE_FRAGMENT_ICON_ID,
      frame: 'hex',
      axis: 'warning',
      title: 'Core fragment',
      glyph: 'core-fragment',
    },
    ...statusEntries(),
    ...gaugeEntries(),
    ...hudLabelEntries(),
    ...chromeEntries(),
    ...panelEntries(),
    ...buttonEntries(),
    ...settingEntries(),
    ...bayEmblemEntries(),
  ]
}

/** Every file icon id, the list the art manifest must ship as final SVGs. */
export function iconFileIds(): string[] {
  return iconEntries().map((entry) => entry.id)
}

export function iconEntryOf(iconId: string): IconEntry | null {
  return iconEntries().find((entry) => entry.id === iconId) ?? null
}

function buyableEntries(): IconEntry[] {
  return [
    ...UPGRADE_IDS.map((track): IconEntry => ({
      id: trackIconIdOf(track),
      frame: 'plate',
      axis: 'brass',
      title: TRACK_TITLES[track] ?? track,
      glyph: kebabOf(track),
    })),
    { id: CASING_ICON_ID, frame: 'plate', axis: 'brass', title: 'Casing', glyph: 'casing' },
    {
      id: REFRACTORY_LINING_ICON_ID,
      frame: 'plate',
      axis: 'verdigris',
      title: 'Lining',
      glyph: 'refractory-lining',
    },
    { id: GUN_ICON_ID, frame: 'plate', axis: 'verdigris', title: 'Guns', glyph: 'gun' },
    {
      id: BLASTING_CHARGES_ICON_ID,
      frame: 'plate',
      axis: 'verdigris',
      title: 'Charges',
      glyph: 'charge',
    },
    {
      id: CHARGE_RACK_ICON_ID,
      frame: 'plate',
      axis: 'verdigris',
      title: 'Rack',
      glyph: 'charge-rack',
    },
    {
      id: REFINERY_SLOT_ICON_ID,
      frame: 'plate',
      axis: 'verdigris',
      title: 'Refinery slot',
      glyph: 'furnace',
    },
  ]
}

function artefactEntries(): IconEntry[] {
  return ARTEFACT_IDS.map((artefactId) => ({
    id: artefactIconIdOf(artefactId),
    frame: 'gear',
    axis: 'verdigris',
    title: ARTEFACT_TITLES[artefactId] ?? artefactId,
    glyph: kebabOf(artefactId.replace(/^artefact\./, '')),
  }))
}

function statusEntries(): IconEntry[] {
  const statuses = [...COMBAT_STATUS_IDS, ...SECONDARY_STATUS_IDS]
  return [
    ...statuses.map((status): IconEntry => ({
      id: combatStatusIconIdOf(status),
      frame: 'triangle',
      axis: 'warning',
      title: STATUS_TITLES[status],
      glyph: `status-${kebabOf(status)}`,
    })),
    ...ENEMY_IDS.map((kind): IconEntry => ({
      id: enemyIconIdOf(kind),
      frame: 'triangle',
      axis: 'warning',
      title: ENEMY_TITLES[kind] ?? kind,
      glyph: `enemy-${kebabOf(kind)}`,
    })),
    ...VEHICLE_MODES.filter(isStrandedOrDestroyed).map((mode): IconEntry => ({
      id: vehicleStateIconIdOf(mode),
      frame: 'triangle',
      axis: 'warning',
      title: MODE_TITLES[mode],
      glyph: `state-${mode}`,
    })),
  ]
}

function isStrandedOrDestroyed(mode: VehicleMode): boolean {
  return mode === 'stranded' || mode === 'destroyed'
}

function gaugeEntries(): IconEntry[] {
  return [
    ...GAUGE_IDS.map((gauge): IconEntry => ({
      id: gaugeIconIdOf(gauge),
      frame: 'none',
      axis: 'brass',
      title: GAUGE_TITLES[gauge],
      glyph: `gauge-${kebabOf(gauge)}`,
    })),
    { id: HEAT_GAUGE_ICON_ID, frame: 'none', axis: 'warning', title: 'Heat', glyph: 'heat' },
  ]
}

function hudLabelEntries(): IconEntry[] {
  return HUD_LABEL_IDS.map((label) => ({
    id: hudLabelIconIdOf(label),
    frame: 'none',
    axis: 'neutral',
    title: HUD_LABEL_TITLES[label],
    glyph: `hud-${kebabOf(label)}`,
  }))
}

function chromeEntries(): IconEntry[] {
  return [
    ...VEHICLE_MODES.filter((mode) => !isStrandedOrDestroyed(mode)).map((mode): IconEntry => ({
      id: vehicleStateIconIdOf(mode),
      frame: 'none',
      axis: 'neutral',
      title: MODE_TITLES[mode],
      glyph: `state-${mode}`,
    })),
    {
      id: platformStateIconIdOf('outpost'),
      frame: 'none',
      axis: 'neutral',
      title: 'Outpost',
      glyph: 'platform-outpost',
    },
    {
      id: platformStateIconIdOf('core_drive'),
      frame: 'none',
      axis: 'neutral',
      title: 'Core drive',
      glyph: 'platform-core-drive',
    },
    { id: PREVIEW_TIER_ICON_ID, frame: 'none', axis: 'brass', title: 'Tier', glyph: 'tier-star' },
    { id: HINT_PLAQUE_ICON_ID, frame: 'none', axis: 'neutral', title: 'Hint', glyph: 'hint' },
    {
      id: TRANSMISSION_ICON_ID,
      frame: 'none',
      axis: 'neutral',
      title: 'Transmission',
      glyph: 'transmission',
    },
  ]
}

function panelEntries(): IconEntry[] {
  return PANEL_IDS.map((panel) => ({
    id: panelIconIdOf(panel),
    frame: 'none',
    axis: 'neutral',
    title: PANEL_TITLES[panel],
    glyph: `panel-${kebabOf(panel)}`,
  }))
}

function buttonEntries(): IconEntry[] {
  return BUTTON_ICON_IDS.map((button) => ({
    id: buttonIconIdOf(button),
    frame: 'none',
    axis: 'neutral',
    title: BUTTON_TITLES[button],
    glyph: `button-${kebabOf(button)}`,
  }))
}

function settingEntries(): IconEntry[] {
  return PREFERENCE_NAMES.map((name) => ({
    id: settingIconIdOf(name),
    frame: 'none',
    axis: 'neutral',
    title: SETTING_TITLES[name],
    glyph: `setting-${kebabOfCamel(name)}`,
  }))
}

/** One emblem per bay (#45): the bay's motif in its own accent, no frame. */
function bayEmblemEntries(): IconEntry[] {
  return PLATFORM_BAY_IDS.map((bay) => ({
    id: bayEmblemIdOf(bay),
    frame: 'none',
    axis: 'neutral',
    title: BAY_TITLES[bay] ?? bay,
    glyph: `emblem-${bay}`,
  }))
}
