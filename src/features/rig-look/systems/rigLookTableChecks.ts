/**
 * What makes a rig look table unloadable (#577, TD shape and the Scalers' additions on the ticket):
 * every problem listed, nothing trimmed. A track is an upgrade track with one row block and one
 * attach point of its own, never a module's or a wagon's; steps rise from the first purchase and
 * each differs from the one before; every tail ladder has 2 to 8 entries and no two neighbours
 * alike, the wrap included, so neighbouring counts always show different looks; and the glows on
 * each part slot, summed over every track that lights it, stay below the lowest cap among them.
 * A step's part is a `vehicle` part or a part of one of the table's look assets (the rig-look seam,
 * ticket 640: TD ruling on #579), and the `vehicle` slot a look part hides has one owner. A plaque
 * template shows its placeholders once each and names only steps that carry a card (ticket 585).
 * Since ticket 809 a track's bands follow the VS step rule: its step is the decade step or the
 * bot's two-planet buys, whichever is fewer; its edges are the step's multiples, at least 2
 * purchases apart, with the authored steps on the first of them; and its finish cycle is long
 * enough that no finish and pip count repeat, no two neighbours alike. Every band name (a step's
 * card, a finish's name) is 3 words at most, and a band's glint over its brightest look stays
 * under the track's cap.
 */
import { isVehiclePartId } from '../../../systems/art/artIds'
import { isAttachId } from '../../../systems/registries/vehicleAttach'
import type { RigLookFinish, RigLookStepRow, TrackLookRows } from './render/rigLookIndex'
import { VEHICLE_LOOK_ASSET_ID } from './render/rigLookFrames'
import {
  bandProblemsOf,
  finishCatalogueProblemsOf,
  finishCycleProblemsOf,
  glintCapProblemsOf,
  glintProblemsOf,
  isBandName,
} from './rigLookBandChecks'
import type { RigLookGlint } from './render/rigLookGlint'
import { plaqueProblemsOf } from './rigLookPlaque'

export interface RigLookTable {
  /** Named glow caps; a track's `glowCap` names one. */
  glowCaps: Readonly<Record<string, number>>
  /** The look assets a step may cut its part from, each with its part ids (`r.artAssets`). */
  lookAssets: Readonly<Record<string, readonly string[]>>
  /** The finishes a band past the art may wear, by id (ticket 809). */
  finishes: Readonly<Record<string, RigLookFinish>>
  /** The glint a purchase that crosses a band plays on that track's glow slots. */
  glint: RigLookGlint
  tracks: readonly TrackLookRows[]
}

/**
 * The five aetheric module points (TD lock on #265, ticket 376), the wagon hitch (`hull.hitch`,
 * TD after the Horizontal Scaler review on #162) and the bore gun's point (`hull.front`, ticket
 * 315), where every bought `bore_gun` module rides the gun (ticket 321): a rig-look part never
 * takes one (HS on #577, which names the bore_gun mounts). `hull.turret` stays open: it is the
 * `combat` line's own showcase point (#588), and a fitted `auto_guns` module wins it at run time,
 * since the turret's modules list their parts there (ticket 589).
 */
export const MODULE_ATTACH_POINTS: readonly string[] = [
  'hull.nose',
  'hull.roof.coils',
  'hull.tail',
  'hull.flank',
  'hull.stack.side',
  'hull.hitch',
  'hull.front',
]

const HEX_COLOUR = /^#[0-9a-f]{6}$/

/** Every problem with `table`, given the upgrade track ids it may name. */
export function rigLookTableProblemsOf(
  table: RigLookTable,
  knownTracks: readonly string[],
): string[] {
  return [
    ...lookAssetProblemsOf(table),
    ...finishCatalogueProblemsOf(table.finishes),
    ...glintProblemsOf(table.glint),
    ...table.tracks.flatMap((rows) => trackProblemsOf(rows, table, knownTracks)),
    ...sharedPointProblemsOf(table.tracks),
    ...sharedHiddenSlotProblemsOf(table.tracks),
    ...glowCapProblemsOf(table),
  ]
}

function trackProblemsOf(
  rows: TrackLookRows,
  table: RigLookTable,
  knownTracks: readonly string[],
): string[] {
  return [
    ...trackIdProblemsOf(rows, table, knownTracks),
    ...slotProblemsOf(rows),
    ...replacedSlotProblemsOf(rows),
    ...stepProblemsOf(rows),
    ...stepPartProblemsOf(rows, table),
    ...bandProblemsOf(rows),
    ...finishCycleProblemsOf(rows, table.finishes),
    ...glintCapProblemsOf(rows, table.glint, capOf(table, rows)),
    ...plaqueProblemsOf(rows),
  ].map((problem) => `${rows.track}: ${problem}`)
}

function trackIdProblemsOf(
  rows: TrackLookRows,
  table: RigLookTable,
  knownTracks: readonly string[],
): string[] {
  const problems: string[] = []
  if (!knownTracks.includes(rows.track)) problems.push('not an upgrade track')
  if (table.tracks.filter((other) => other.track === rows.track).length > 1) {
    problems.push('has more than one row block')
  }
  if (!(rows.glowCap in table.glowCaps)) problems.push(`no glow cap named ${rows.glowCap}`)
  return problems
}

function slotProblemsOf(rows: TrackLookRows): string[] {
  const problems: string[] = []
  if (!isAttachId(rows.slot)) problems.push(`slot ${rows.slot} is not a vehicle-attach point`)
  if (MODULE_ATTACH_POINTS.includes(rows.slot)) {
    problems.push(`slot ${rows.slot} is a module or wagon point`)
  }
  if (rows.glowSlots.length === 0 || rows.glowSlots.some((group) => group.length === 0)) {
    problems.push('needs at least one glow slot in every group')
  }
  return problems
}

/** A look asset is a `vehicle-` asset of its own with at least one part, none repeated. */
function lookAssetProblemsOf(table: RigLookTable): string[] {
  return Object.entries(table.lookAssets).flatMap(([assetId, parts]) => {
    const problems: string[] = []
    if (!assetId.startsWith(`${VEHICLE_LOOK_ASSET_ID}-`)) problems.push('is not a vehicle- asset')
    if (parts.length === 0) problems.push('has no part')
    if (new Set(parts).size !== parts.length) problems.push('repeats a part')
    return problems.map((problem) => `look asset ${assetId}: ${problem}`)
  })
}

function replacedSlotProblemsOf(rows: TrackLookRows): string[] {
  if (rows.replaces === undefined || isVehiclePartId(`t1-${rows.replaces}`)) return []
  return [`replaces ${rows.replaces}, which is not a vehicle part slot`]
}

/** Each step's part is a `vehicle` part or a part of the look asset the step names. */
function stepPartProblemsOf(rows: TrackLookRows, table: RigLookTable): string[] {
  return rows.steps.flatMap((step) =>
    partProblemsOf(step, table).map((problem) => `step from ${step.from}: ${problem}`),
  )
}

function partProblemsOf(step: RigLookStepRow, table: RigLookTable): string[] {
  const assetId = step.asset ?? VEHICLE_LOOK_ASSET_ID
  if (step.part === null) return step.asset === undefined ? [] : [`names ${assetId} but no part`]
  if (assetId === VEHICLE_LOOK_ASSET_ID) {
    return isVehiclePartId(step.part) ? [] : [`part ${step.part} is not a vehicle part`]
  }
  const parts = table.lookAssets[assetId]
  if (parts === undefined) return [`asset ${assetId} is not a look asset`]
  return parts.includes(step.part) ? [] : [`part ${step.part} is not a part of ${assetId}`]
}

function stepProblemsOf(rows: TrackLookRows): string[] {
  if (rows.steps.length === 0) return ['has no step']
  return rows.steps.flatMap((step, at) => {
    const problems: string[] = []
    const before = at === 0 ? null : rows.steps[at - 1]
    if (!Number.isInteger(step.from) || step.from < 1) problems.push('from is not a count from 1')
    if (before !== null && step.from <= before.from) problems.push('from does not rise')
    if (before !== null && step.colour === before.colour) problems.push('repeats the step before')
    if (!HEX_COLOUR.test(step.colour)) problems.push(`colour ${step.colour} is not #rrggbb`)
    if (step.card !== null && !isBandName(step.card)) problems.push(`card ${step.card} is long`)
    problems.push(...glowProblemsOf(step.glows, rows))
    return problems.map((problem) => `step from ${step.from}: ${problem}`)
  })
}

function glowProblemsOf(glows: readonly number[], rows: TrackLookRows): string[] {
  const problems: string[] = []
  if (glows.length !== rows.glowSlots.length) problems.push('needs one glow per glow slot group')
  if (glows.some((glow) => !(glow >= 0))) problems.push('has a negative glow')
  return problems
}

/** One attach point per track. */
function sharedPointProblemsOf(tracks: readonly TrackLookRows[]): string[] {
  return tracks
    .filter((rows, at) => tracks.findIndex((other) => other.slot === rows.slot) !== at)
    .map((rows) => `${rows.track}: slot ${rows.slot} is another track's`)
}

/** One owner per hidden `vehicle` slot: two looks never stand in the same part. */
function sharedHiddenSlotProblemsOf(tracks: readonly TrackLookRows[]): string[] {
  return tracks
    .filter((rows, at) => isSecondToHide(tracks, rows, at))
    .map((rows) => `${rows.track}: replaces ${rows.replaces}, another track's`)
}

function isSecondToHide(
  tracks: readonly TrackLookRows[],
  rows: TrackLookRows,
  at: number,
): boolean {
  if (rows.replaces === undefined) return false
  return tracks.findIndex((other) => other.replaces === rows.replaces) !== at
}

/** Per part slot: the brightest glow each track can put there, summed, under the lowest cap. */
function glowCapProblemsOf(table: RigLookTable): string[] {
  return partSlotsOf(table.tracks)
    .filter((slot) => slotGlowOf(table.tracks, slot) >= slotCapOf(table, slot))
    .map((slot) => `part slot ${slot}: glows reach the ${lowestCapNameOf(table, slot)} cap`)
}

function partSlotsOf(tracks: readonly TrackLookRows[]): string[] {
  return [...new Set(tracks.flatMap((rows) => rows.glowSlots.flat()))]
}

function slotGlowOf(tracks: readonly TrackLookRows[], slot: string): number {
  return tracksLighting(tracks, slot).reduce((sum, rows) => sum + brightestGlowOn(rows, slot), 0)
}

function slotCapOf(table: RigLookTable, slot: string): number {
  return Math.min(...tracksLighting(table.tracks, slot).map((rows) => capOf(table, rows)))
}

function lowestCapNameOf(table: RigLookTable, slot: string): string {
  const lighting = tracksLighting(table.tracks, slot)
  return lighting.reduce((low, rows) => (capOf(table, rows) < capOf(table, low) ? rows : low))
    .glowCap
}

function capOf(table: RigLookTable, rows: TrackLookRows): number {
  return table.glowCaps[rows.glowCap] ?? 0
}

function tracksLighting(tracks: readonly TrackLookRows[], slot: string): TrackLookRows[] {
  return tracks.filter((rows) => rows.glowSlots.some((group) => group.includes(slot)))
}

function brightestGlowOn(rows: TrackLookRows, slot: string): number {
  const groups = rows.glowSlots.flatMap((group, at) => (group.includes(slot) ? [at] : []))
  const glows = rows.steps.map((step) => step.glows)
  return Math.max(0, ...glows.flatMap((each) => groups.map((at) => each[at] ?? 0)))
}
