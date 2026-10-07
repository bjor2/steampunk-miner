/**
 * The mining gates' data (#142 "Numbers" and its economy.json block, the GD lock on #148), read
 * once from the slice's two files and refused whole when broken, so a bad row fails at load with
 * every problem listed.
 *
 * - `mining-gates.economy.json` (Systems): the planet gate content starts on (the GD lock: P7, with
 *   the dynamite gate), #142's 15% guard in basis points of a band's ore value, the extractor
 *   cadence `first + every * k`, the extractor price in band-5 ore at its own planet, and the
 *   endless signature cycle.
 * - `rigs.json` (Progression & Content): the five extractors in arrival order, each with the gate
 *   class it opens, what a cell of that class does without it (`refused` or `lost`), its mount, its
 *   tree node and its player text.
 *
 * The dense floor is the kernel's `drill.denseScratchFloor` (GD lock: kernel economy.json), and a
 * dynamite gate's charge size is #143's `minChargeFor` from the dynamite index.
 */
import {
  createFieldReader,
  readBandOreCost,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import { isAttachId, type AttachId } from '../../../systems/registries/vehicleAttach'
import economyFile from '../mining-gates.economy.json'
import rigsFile from '../rigs.json'

/** What a rig-gated cell does to a drill without its extractor (#142 "The extraction rigs"). */
export type RiglessOutcome = 'refused' | 'lost'

export interface Rig {
  /** The bare catalogue id, `rig.<name>` (#162). */
  id: string
  /** The family `gateClass` (#141) whose cells it opens. */
  gateClass: string
  /** Player text: an extractor, never a rig (#159). */
  name: string
  withoutRig: RiglessOutcome
  attach: AttachId
  /** The tech node that unlocks it (#162). */
  unlockedBy: string
  description: string
}

export interface GateRows {
  gateContentFromPlanet: number
  maxGatedValueShareBp: number
  rigFirstPlanet: number
  rigEveryPlanets: number
  rigPrice: BandOreCost
  endlessCycleFromPlanet: number
  endlessCycleEvery: number
  /** In arrival order: rig `k` arrives on planet `rigFirstPlanet + rigEveryPlanets * k`. */
  rigs: readonly Rig[]
}

const RIGLESS_OUTCOMES: readonly string[] = ['refused', 'lost']

export const GATE_ROWS: GateRows = loadGateRows(economyFile, rigsFile)

/** Every problem with the two files, or the rows when they have none. */
export function readGateRows(
  economy: unknown,
  rigs: unknown,
): { rows: GateRows } | { problems: string[] } {
  const reader = createFieldReader()
  const gates = reader.object('miningGates', reader.object('economy', economy).miningGates)
  const availability = reader.object('miningGates.rigAvailability', gates.rigAvailability)
  const cycle = reader.object('miningGates.endlessSignatureCycle', gates.endlessSignatureCycle)
  const rows: GateRows = {
    gateContentFromPlanet: reader.safeInteger('gateContentFromPlanet', gates.gateContentFromPlanet),
    maxGatedValueShareBp: reader.safeInteger('maxGatedValueShareBp', gates.maxGatedValueShareBp),
    rigFirstPlanet: reader.safeInteger('rigAvailability.first', availability.first),
    rigEveryPlanets: reader.safeInteger('rigAvailability.every', availability.every),
    rigPrice: readBandOreCost(reader, 'miningGates.rigPrice', gates.rigPrice),
    endlessCycleFromPlanet: reader.safeInteger(
      'endlessSignatureCycle.fromPlanet',
      cycle.fromPlanet,
    ),
    endlessCycleEvery: reader.safeInteger('endlessSignatureCycle.every', cycle.every),
    rigs: readRigs(reader, reader.object('rigs', rigs).rigs),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { rows }
}

function loadGateRows(economy: unknown, rigs: unknown): GateRows {
  const reading = readGateRows(economy, rigs)
  if ('problems' in reading) {
    throw new Error(`mining-gates data is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.rows
}

function readRigs(reader: FieldReader, raw: unknown): Rig[] {
  return reader.list('rigs.rigs', raw).map((row, at) => readRig(reader, `rigs.rigs[${at}]`, row))
}

function readRig(reader: FieldReader, path: string, raw: unknown): Rig {
  const row = reader.object(path, raw)
  return {
    id: reader.text(`${path}.id`, row.id),
    gateClass: reader.text(`${path}.gateClass`, row.gateClass),
    name: reader.text(`${path}.name`, row.name),
    withoutRig: readRiglessOutcome(reader, `${path}.withoutRig`, row.withoutRig),
    attach: readAttach(reader, `${path}.attach`, row.attach),
    unlockedBy: reader.text(`${path}.unlockedBy`, row.unlockedBy),
    description: reader.text(`${path}.description`, row.description),
  }
}

function readRiglessOutcome(reader: FieldReader, path: string, raw: unknown): RiglessOutcome {
  const outcome = reader.text(path, raw)
  if (RIGLESS_OUTCOMES.includes(outcome)) return outcome as RiglessOutcome
  reader.record(`${path} must be refused or lost, got ${JSON.stringify(raw)}`)
  return 'refused'
}

function readAttach(reader: FieldReader, path: string, raw: unknown): AttachId {
  const attach = reader.text(path, raw)
  if (isAttachId(attach)) return attach
  reader.record(`${path} must be a vehicle attach id, got ${JSON.stringify(raw)}`)
  return 'drill.fork'
}
