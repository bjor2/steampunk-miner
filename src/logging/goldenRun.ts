/**
 * Golden runs (decision #11 section 3, #29 CI gates): a committed seed, command list and the
 * digests the authority logged for it, under the versions that produced them. Replaying the file
 * must reproduce every digest, at the default clock and in 30 and 144 render-frame batches.
 *
 * - Digests or the mined order (#122: the ore of every `CargoAdded`, run-length encoded) differ
 *   while every recorded version equals the code's: the authority changed what a command list does
 *   without saying so. Fail; bump the version that owns the change.
 * - A version differs: the file is stale. Fail with "regenerate the golden file", so a digest
 *   change always arrives as a version bump plus a visible diff of the file in the same commit.
 *
 * `sliceSections` records each registered save section's version (feature-slices.md 5.4), written
 * only while one is registered, so a build without sections writes the files byte for byte as
 * before. It is compared exactly both ways: a slice section change needs that section's version
 * bump and a regenerated golden, never `SNAPSHOT_VERSION`.
 */
import { AUTHORITY_PROTOCOL_VERSION } from '../systems/authority/authorityCommand'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { GENERATOR_VERSION } from '../systems/generatorVersion'
import { NUMBER_FORMAT_VERSION } from '../systems/money'
import { saveSectionsOf } from '../systems/registries/saveSections'
import { stampScript, type GoldenScript } from '../systems/replay/goldenScripts'
import { firstDigestMismatch, replayRun, type DigestRecord } from '../systems/replay/replayRun'
import { minedOrderOf, type MinedOre, type MinedRun } from './minedOrder'
import { LOG_SCHEMA_VERSION } from './runEvent'

export interface GoldenVersions {
  generatorVersion: number
  authorityProtocolVersion: number
  logSchemaVersion: number
  numberFormatVersion: number
  /** Each registered save section's version by id; omitted while none is registered. */
  sliceSections?: Record<string, number>
}

type NumberVersionName = Exclude<keyof GoldenVersions, 'sliceSections'>

const NUMBER_VERSION_NAMES: readonly NumberVersionName[] = [
  'generatorVersion',
  'authorityProtocolVersion',
  'logSchemaVersion',
  'numberFormatVersion',
]

export interface GoldenRun extends GoldenVersions {
  name: string
  description: string
  worldSeed: number
  endTick: number
  commands: AuthorityCommand[]
  digests: DigestRecord[]
  /** The ore the run mined, in order, as `summary.json` keeps it (#122). */
  minedOrder: MinedRun[]
}

/** The render rates a golden run must give identical digests at (#29 Gameplay acceptance 1). */
export const GOLDEN_FRAME_RATES: readonly number[] = [30, 144]

export const REGENERATE_HINT = 'regenerate the golden file with `npm run golden:update`'

export function currentGoldenVersions(): GoldenVersions {
  return {
    generatorVersion: GENERATOR_VERSION,
    authorityProtocolVersion: AUTHORITY_PROTOCOL_VERSION,
    logSchemaVersion: LOG_SCHEMA_VERSION,
    numberFormatVersion: NUMBER_FORMAT_VERSION,
    ...sliceSectionVersions(),
  }
}

/** `{ sliceSections }` of every registered section, session then player, sorted by id. */
function sliceSectionVersions(): Pick<GoldenVersions, 'sliceSections'> {
  const sections = [...saveSectionsOf('session'), ...saveSectionsOf('player')]
  if (sections.length === 0) return {}
  const sorted = sections.sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1))
  return {
    sliceSections: Object.fromEntries(sorted.map((section) => [section.id, section.version])),
  }
}

/** The file a script records today: its commands replayed once, with the current versions. */
export function recordGoldenRun(script: GoldenScript): GoldenRun {
  const commands = stampScript(script)
  const { digests, events } = replayRun(script.worldSeed, commands, { endTick: script.endTick })
  const { name, description, worldSeed, endTick } = script
  const minedOrder = minedRunsOf(events)
  return {
    name,
    description,
    ...currentGoldenVersions(),
    worldSeed,
    endTick,
    commands,
    digests,
    minedOrder,
  }
}

/** Every reason a committed golden run fails; empty when it replays exactly. */
export function goldenRunProblems(golden: GoldenRun): string[] {
  const stale = staleVersionProblems(golden)
  if (stale.length > 0) return stale
  return [undefined, ...GOLDEN_FRAME_RATES].flatMap((framesPerSecond) =>
    replayProblems(golden, framesPerSecond),
  )
}

function staleVersionProblems(golden: GoldenRun): string[] {
  const current = currentGoldenVersions()
  return [
    ...staleNumberVersionProblems(golden, current),
    ...staleSliceSectionProblems(golden, current),
  ]
}

function staleNumberVersionProblems(golden: GoldenRun, current: GoldenVersions): string[] {
  return NUMBER_VERSION_NAMES.filter((version) => golden[version] !== current[version]).map(
    (version) =>
      `${golden.name}: ${version} is ${golden[version]} in the file and ${current[version]} ` +
      `in the code; ${REGENERATE_HINT}`,
  )
}

/** Exact both ways: a section added, dropped or re-versioned since the file was written. */
function staleSliceSectionProblems(golden: GoldenRun, current: GoldenVersions): string[] {
  const inFile = JSON.stringify(golden.sliceSections ?? {})
  const inCode = JSON.stringify(current.sliceSections ?? {})
  if (inFile === inCode) return []
  return [
    `${golden.name}: sliceSections are ${inFile} in the file and ${inCode} in the code; ` +
      REGENERATE_HINT,
  ]
}

function replayProblems(golden: GoldenRun, framesPerSecond: number | undefined): string[] {
  const { digests, events } = replayRun(golden.worldSeed, golden.commands, {
    endTick: golden.endTick,
    framesPerSecond,
  })
  const mismatch =
    firstDigestMismatch(golden.digests, digests) ??
    firstMinedRunMismatch(golden.minedOrder, minedRunsOf(events))
  if (mismatch === null) return []
  const clock = framesPerSecond === undefined ? 'the fixed step' : `${framesPerSecond} fps`
  return [
    `${golden.name} at ${clock}: ${mismatch}. The versions are unchanged, so this is an ` +
      `unannounced change to what a command list does: bump the version that owns it, then ` +
      REGENERATE_HINT,
  ]
}

function minedRunsOf(events: readonly DomainEvent[]): MinedRun[] {
  return minedOrderOf(events.flatMap(minedOreOfEvent)).runs
}

function minedOreOfEvent(event: DomainEvent): MinedOre[] {
  return event.type === 'CargoAdded' ? [{ oreId: event.oreId, amount: event.amount }] : []
}

/** The first run of the mined order the replay does not reproduce, with its index. */
function firstMinedRunMismatch(
  logged: readonly MinedRun[],
  replayed: readonly MinedRun[],
): string | null {
  const index = firstDifferingIndex(logged.map(String), replayed.map(String))
  if (index === null) return null
  const textOf = (run: MinedRun | undefined) => (run === undefined ? 'none' : run.join(' x'))
  return (
    `mined order run ${index} differs: logged ${textOf(logged[index])}, ` +
    `replayed ${textOf(replayed[index])}`
  )
}

function firstDifferingIndex(a: readonly string[], b: readonly string[]): number | null {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index++) {
    if (a[index] !== b[index]) return index
  }
  return null
}

/** The committed text: two-space JSON and a final newline, so a diff shows each digest. */
export function formatGoldenRun(golden: GoldenRun): string {
  return `${JSON.stringify(golden, null, 2)}\n`
}
