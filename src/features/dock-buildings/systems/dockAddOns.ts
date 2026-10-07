/**
 * The three in-place dock add-ons of the #170 amendment (Horizontal Scaler's schedule C; the TD
 * lock on #197): the scanner mast on the Assay & Exchange (`scanner_station`, P14), the research
 * annex behind the Engineering Works (`research_lab`, P15) and the drone hangar on the Works'
 * roof (`drone_bay`, P20). Each is a `facility` row of the locked schedule and stands on the pad
 * only where the platform has built that row, read from the kernel's built-facility rows and
 * never from the planet index alone (H1: a vision row shows nothing). The table is
 * `dockAddOns.json` beside the slice, which the Blender authoring and review scripts read too, so
 * the renders compose the pad with the game's offsets.
 *
 * Each add-on is one Blender asset of at most two parts (#170 amendment "Parts"): the static
 * shell, carrying the asset's id as every platform asset does, and the one part the code can
 * move. Its art id is the #52 kebab form of its row id under the platform category; the wiring
 * (#222) registers it through `r.artAssets` (#214).
 */
import { isKebabId, kebabOf } from '../../../systems/art/artNaming'
import type { ShopBuildingBayId } from '../../../systems/art/shopBuildingArt'
import ADD_ONS_FILE from '../dockAddOns.json'

/** #170 amendment "Parts": each in-place add-on is capped at 2 parts. */
export const MAX_DOCK_ADD_ON_PARTS = 2

export const DOCK_ADD_ON_IDS = ['scanner_mast', 'research_annex', 'drone_hangar'] as const
export type DockAddOnId = (typeof DOCK_ADD_ON_IDS)[number]

/** Drawn behind its host's shell (the annex) or in front of it (the mast, the hangar). */
export type DockAddOnLayer = 'behind' | 'front'

export interface DockAddOn {
  id: DockAddOnId
  /** The locked schedule's `facility` row this building is. */
  rowId: string
  /** The shop building it bolts onto; the add-on is placed in that building's frame. */
  host: ShopBuildingBayId
  layer: DockAddOnLayer
  /** The add-on's origin in metres from its host's origin (the zone centre on the pad top). */
  atM: readonly [number, number]
  /** Where the unlock pan looks, in metres from the add-on's origin. */
  lookAtM: readonly [number, number]
  /** The one part drawn over the shell that the code moves. */
  movingPartId: string
}

const HOSTS: readonly ShopBuildingBayId[] = ['sell', 'upgrade']
const LAYERS: readonly DockAddOnLayer[] = ['behind', 'front']

/** In unlock order, as the file lists them. */
export const DOCK_ADD_ONS: readonly DockAddOn[] = readDockAddOns(ADD_ONS_FILE.addOns)

export function dockAddOnAssetIdOf(addOn: DockAddOn): string {
  return `platform-${kebabOf(addOn.rowId)}`
}

/** The shell first, then what moves. */
export function dockAddOnPartIdsOf(addOn: DockAddOn): string[] {
  return [dockAddOnAssetIdOf(addOn), addOn.movingPartId]
}

export function dockAddOnOfRow(rowId: string): DockAddOn | null {
  return DOCK_ADD_ONS.find((addOn) => addOn.rowId === rowId) ?? null
}

/** The add-ons standing on the pad: those whose facility row the platform has built. */
export function standingDockAddOnsOf(builtFacilityRowIds: ReadonlySet<string>): DockAddOn[] {
  return DOCK_ADD_ONS.filter((addOn) => builtFacilityRowIds.has(addOn.rowId))
}

/** The file's rows, refused whole (every problem listed) rather than trimmed. */
function readDockAddOns(rows: readonly unknown[]): DockAddOn[] {
  const problems = rows.flatMap((row, index) => addOnProblems(row, index))
  if (problems.length > 0) throw new Error(`dockAddOns.json: ${problems.join('; ')}`)
  return rows as DockAddOn[]
}

function addOnProblems(row: unknown, index: number): string[] {
  if (typeof row !== 'object' || row === null) return [`row ${index} is not an object`]
  const candidate = row as Record<string, unknown>
  return [
    ...unless(isDockAddOnId(candidate.id), `row ${index} has an unknown id`),
    ...unless(isSnakeId(candidate.rowId), `row ${index} names no schedule row`),
    ...unless(isOneOf(HOSTS, candidate.host), `row ${index} has no shop building host`),
    ...unless(isOneOf(LAYERS, candidate.layer), `row ${index} has no layer`),
    ...unless(isPointM(candidate.atM), `row ${index} has no atM point`),
    ...unless(isPointM(candidate.lookAtM), `row ${index} has no lookAtM point`),
    ...unless(isPartId(candidate.movingPartId), `row ${index} has no kebab moving part id`),
  ]
}

function unless(isFine: boolean, problem: string): string[] {
  return isFine ? [] : [problem]
}

function isDockAddOnId(value: unknown): value is DockAddOnId {
  return (DOCK_ADD_ON_IDS as readonly unknown[]).includes(value)
}

function isOneOf<T>(allowed: readonly T[], value: unknown): value is T {
  return (allowed as readonly unknown[]).includes(value)
}

function isSnakeId(value: unknown): boolean {
  return typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value)
}

function isPartId(value: unknown): boolean {
  return typeof value === 'string' && isKebabId(value)
}

function isPointM(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
}
