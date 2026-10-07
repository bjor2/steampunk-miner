/**
 * The mounted gear of the tech tree's items (spec #162 section 5, art #166): which Blender asset
 * and parts each physical item draws, at which attach point of the TD's `vehicle-attach` table.
 * Read from `techGear.json`, the one table the authoring script, the review renders and these
 * rules share. Render-only: nothing here reaches the authority, a snapshot or a digest.
 */
import { slotItemAssetIdOf } from '../../../../systems/art/artIds'
import type { ArtAsset } from '../../../../systems/registries/artAssets'
import type { ItemAttach } from '../../../../systems/registries/vehicleAttach'
import TECH_GEAR_FILE from '../../techGear.json'

/**
 * `extractor`: always mounted once owned, folds and deploys (G&V); `head`, `collar`, `flank`: the
 * drill sockets; `signature`: a power-up with its own named point; `passive`: owned, no slot;
 * `gauge`: a dial of the cab gauge cluster; `slot`: a module housing at `hull.powerup.n`;
 * `crate`: a consumable's crate on the charge rack's shelves.
 */
export type GearKind =
  'extractor' | 'head' | 'collar' | 'flank' | 'signature' | 'passive' | 'gauge' | 'slot' | 'crate'

/** A part's resting pose: a turn about its pivot, radians, and a shift of the pivot, metres. */
export interface PartPose {
  turn: number
  shift: readonly [number, number]
}

export interface GearPart {
  id: string
  /** Present on a part the code moves: where it sits idle and where it sits at work. */
  folded?: PartPose
  deployed?: PartPose
}

export interface MountedGear {
  itemId: string
  kind: GearKind
  attach: ItemAttach
  assetId: string
  /** The cap a folded extractor keeps visible at gameplay zoom (GD, 6 Oct). */
  capColour?: string
  /** Drawn once above the drill axis and once mirrored below it (side cutters). */
  mirrored?: boolean
  parts: readonly GearPart[]
}

/** The G&V deploy timing: unfold within 8 ticks, fold back 30 ticks after the cell is left. */
export interface DeployTiming {
  unfoldTicks: number
  holdTicks: number
  foldTicks: number
}

export interface CrateRack {
  assetId: string
  shelfPartId: string
  columns: number
  rows: number
  pitchM: readonly [number, number]
  firstM: readonly [number, number]
}

export type FxKind =
  | 'stream'
  | 'drag'
  | 'gather'
  | 'free'
  | 'ring'
  | 'cone'
  | 'burn'
  | 'curtain'
  | 'plume'
  | 'line'
  | 'plate'

export interface PowerUpFx {
  id: string
  itemId: string
  kind: FxKind
  /** How long the effect shows; 1 for a standing effect that stays until replaced. */
  ticks: number
  /** Ticks the effect takes to reach its full extent. */
  sweepTicks: number
  reachTiles: number
  /** Strands, nodules, motes or droplets drawn at full strength. */
  strands: number
  colour: string
}

interface TechGearFile {
  deploy: DeployTiming
  crateRack: CrateRack
  gauges: { assetId: string; clusterPartId: string }
  items: readonly MountedGear[]
  fx: readonly PowerUpFx[]
}

const FILE = TECH_GEAR_FILE as unknown as TechGearFile

export const DEPLOY_TIMING: DeployTiming = FILE.deploy
export const CRATE_RACK: CrateRack = FILE.crateRack
export const GAUGE_CLUSTER = FILE.gauges
export const MOUNTED_GEAR: readonly MountedGear[] = FILE.items
export const POWER_UP_FX: readonly PowerUpFx[] = FILE.fx

export function mountedGearOf(itemId: string): MountedGear | null {
  return MOUNTED_GEAR.find((gear) => gear.itemId === itemId) ?? null
}

export function powerUpFxOf(fxId: string): PowerUpFx | null {
  return POWER_UP_FX.find((fx) => fx.id === fxId) ?? null
}

/** The effects an item shows, in table order. */
export function powerUpFxOfItem(itemId: string): PowerUpFx[] {
  return POWER_UP_FX.filter((fx) => fx.itemId === itemId)
}

/** An item's own asset follows the kernel's slot-model name; a shared cluster has its own. */
export function isOwnGearAsset(gear: MountedGear): boolean {
  return gear.assetId === slotItemAssetIdOf(gear.itemId)
}

/** What the slice registers (#214): every gear asset under the vehicle category with its parts. */
export function techGearArtAssets(): ArtAsset[] {
  return gearAssetIds().map((assetId) => ({
    id: assetId,
    category: 'vehicle',
    parts: gearPartIdsOf(assetId),
  }))
}

export function gearAssetIds(): string[] {
  return [...new Set(MOUNTED_GEAR.map((gear) => gear.assetId))].sort()
}

/** Every part the asset holds, across the items that share it, sorted. */
export function gearPartIdsOf(assetId: string): string[] {
  const ids = MOUNTED_GEAR.filter((gear) => gear.assetId === assetId).flatMap((gear) =>
    gear.parts.map((part) => part.id),
  )
  return [...new Set(ids)].sort()
}

/** The crate of a consumable: the item's `crate-<id>` part on the rack's shelves. */
export function crateOfRow(column: number, row: number): readonly [number, number] {
  const [firstX, firstZ] = CRATE_RACK.firstM
  const [pitchX, pitchZ] = CRATE_RACK.pitchM
  return [firstX + column * pitchX, firstZ + row * pitchZ]
}
