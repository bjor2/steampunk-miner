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
 */
import { isVehiclePartId } from '../../../systems/art/artIds'
import { isAttachId } from '../../../systems/registries/vehicleAttach'
import type { RigLookStepRow, RigLookTail, TrackLookRows } from './render/rigLookIndex'
import { VEHICLE_LOOK_ASSET_ID } from './render/rigLookFrames'
import { plaqueProblemsOf } from './rigLookPlaque'

export interface RigLookTable {
  /** Named glow caps; a track's `glowCap` names one. */
  glowCaps: Readonly<Record<string, number>>
  /** The look assets a step may cut its part from, each with its part ids (`r.artAssets`). */
  lookAssets: Readonly<Record<string, readonly string[]>>
  tracks: readonly TrackLookRows[]
}

/**
 * The five aetheric module points (TD lock on #265, ticket 376) and the wagon hitch (`hull.hitch`,
 * TD after the Horizontal Scaler review on #162): a rig-look part never takes one (HS on #577).
 */
export const MODULE_ATTACH_POINTS: readonly string[] = [
  'hull.nose',
  'hull.roof.coils',
  'hull.tail',
  'hull.flank',
  'hull.stack.side',
  'hull.hitch',
]

const LADDER_MIN = 2
const LADDER_MAX = 8
const HEX_COLOUR = /^#[0-9a-f]{6}$/

/** Every problem with `table`, given the upgrade track ids it may name. */
export function rigLookTableProblemsOf(
  table: RigLookTable,
  knownTracks: readonly string[],
): string[] {
  return [
    ...lookAssetProblemsOf(table),
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
    ...tailProblemsOf(rows),
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
    problems.push(...glowProblemsOf(step.glows, rows))
    return problems.map((problem) => `step from ${step.from}: ${problem}`)
  })
}

function tailProblemsOf(rows: TrackLookRows): string[] {
  const { tail } = rows
  const problems = [
    ...ladderProblemsOf('palette', tail.palette, (a, b) => a === b),
    ...ladderProblemsOf('plating', tail.plating, (a, b) => a === b),
    ...ladderProblemsOf('glow', tail.glow, isSameGlow),
    ...tail.palette.filter((colour) => !HEX_COLOUR.test(colour)).map(notHexProblem),
    ...tail.glow.flatMap((glows) => glowProblemsOf(glows, rows)),
    ...deltaProblemsOf(tail),
  ]
  if (tail.palette[0] === rows.steps.at(-1)?.colour) problems.push('palette starts on the top step')
  return problems.map((problem) => `tail: ${problem}`)
}

function deltaProblemsOf(tail: RigLookTail): string[] {
  return Number.isInteger(tail.delta) && tail.delta >= 1 ? [] : ['delta is not a count from 1']
}

/** 2 to 8 entries, no neighbours alike, the last and the first included. */
function ladderProblemsOf<T>(
  name: string,
  ladder: readonly T[],
  isSame: (a: T, b: T) => boolean,
): string[] {
  if (ladder.length < LADDER_MIN || ladder.length > LADDER_MAX) {
    return [`${name} has ${ladder.length} entries, not ${LADDER_MIN} to ${LADDER_MAX}`]
  }
  const repeats = ladder.filter((entry, at) => isSame(entry, ladder[(at + 1) % ladder.length]))
  return repeats.length === 0 ? [] : [`${name} repeats a neighbour`]
}

function isSameGlow(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((glow, at) => glow === b[at])
}

function glowProblemsOf(glows: readonly number[], rows: TrackLookRows): string[] {
  const problems: string[] = []
  if (glows.length !== rows.glowSlots.length) problems.push('needs one glow per glow slot group')
  if (glows.some((glow) => !(glow >= 0))) problems.push('has a negative glow')
  return problems
}

function notHexProblem(colour: string): string {
  return `colour ${colour} is not #rrggbb`
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
  const glows = [...rows.steps.map((step) => step.glows), ...rows.tail.glow]
  return Math.max(0, ...glows.flatMap((each) => groups.map((at) => each[at] ?? 0)))
}
