/**
 * The drill's verdict on an extractor-gated cell (#142 "The extraction rigs", ticket 237), and the
 * one terrain edit an extractor makes. Without its extractor a cell does what its row says: the
 * drill skids (`refused`) or the cell breaks and its ore is lost (`lost`: vented or drifted).
 * With it, the extractor's verb decides:
 *
 * | verb    | cut when                         | else                                      |
 * | ------- | -------------------------------- | ----------------------------------------- |
 * | tune    | a tuned patch holds the cell     | refused, opens a tune after the touch     |
 * | capture | a canister is free               | lost: the ore vents                       |
 * | mark    | a mark over it has etched        | refused, opens an etch while marks last   |
 * | pull    | never by the drill               | refused, opens a pull after the touch     |
 * | tow     | the cable is free                | lost: the lump drifts off                 |
 *
 * `required` names what the cell waits for as `<extractor>:<state>`, so a `gate_hit` with the
 * extractor owned reads apart from one without it (`have: none`).
 */
import type { GateQuery, GateVerdict } from '../../../systems/registries/gateChecks'
import { hasCableFree, hasCanisterLeft } from './captureAndTow'
import { isEtchedAt, ticksUntilEtched } from './etching'
import { extractorStateOf, type ExtractorState } from './extractorState'
import type { Rig } from './gateRows'
import { PULL_TOOL, ticksUntilPulled } from './pulling'
import { ownsRig } from './rigs'
import { isTunedAt, ticksUntilTuned } from './tuning'
import { verbOfRig, type VerbName } from './verbRows'

type OwnedVerdict = (rig: Rig, value: ExtractorState, query: GateQuery) => GateVerdict

const OWNED_VERDICTS: Readonly<Record<VerbName, OwnedVerdict>> = {
  tune: (rig, value, { tile, state }) =>
    isTunedAt(value, tile, state.tick)
      ? cutBy(rig)
      : waitingFor(rig, 'tuned', ticksUntilTuned(value, tile, state.tick)),
  capture: (rig, value) => (hasCanisterLeft(value) ? cutBy(rig) : lostBy(rig, 'canister')),
  mark: (rig, value, { tile, state }) =>
    isEtchedAt(value, tile, state.tick)
      ? cutBy(rig)
      : waitingFor(rig, 'etched', ticksUntilEtched(value, tile, state.tick)),
  pull: (rig, value, { tile, state }) =>
    waitingFor(rig, 'pulled', ticksUntilPulled(value, tile, state.tick)),
  tow: (rig, value) => (hasCableFree(value) ? cutBy(rig) : lostBy(rig, 'free_cable')),
}

/** The drill's verdict: the extractor's verb with it, the row's outcome without. */
export function extractorDrillVerdictOf(rig: Rig, query: GateQuery): GateVerdict {
  if (!ownsRig(query.state, query.playerId, rig.id)) return riglessVerdictOf(rig)
  const value = extractorStateOf(query.state, query.playerId)
  return OWNED_VERDICTS[verbOfRig(rig)](rig, value, query)
}

/** A blast or a power-up never opens an extractor cell, owned or not (#142 constraints). */
export function extractorStandingVerdictOf(rig: Rig, query: GateQuery): GateVerdict {
  const isOwned = ownsRig(query.state, query.playerId, rig.id)
  return { outcome: 'refused', gateKind: 'rig', required: rig.id, have: haveOf(rig, isOwned) }
}

/** The coil's own terrain edit opens the coil cell it pulled; nothing else gets through. */
export function isCoilPull(rig: Rig, query: GateQuery): boolean {
  return (
    query.tool === PULL_TOOL &&
    verbOfRig(rig) === 'pull' &&
    ownsRig(query.state, query.playerId, rig.id)
  )
}

function riglessVerdictOf(rig: Rig): GateVerdict {
  return { outcome: rig.withoutRig, gateKind: 'rig', required: rig.id, have: 'none' }
}

function cutBy(rig: Rig): GateVerdict {
  return { outcome: 'cut', gateKind: 'rig', required: rig.id, have: rig.id }
}

function lostBy(rig: Rig, needed: string): GateVerdict {
  return { outcome: 'lost', gateKind: 'rig', required: `${rig.id}:${needed}`, have: rig.id }
}

function waitingFor(rig: Rig, needed: string, opensAfterTicks: number | undefined): GateVerdict {
  return {
    outcome: 'refused',
    gateKind: 'rig',
    required: `${rig.id}:${needed}`,
    have: rig.id,
    ...(opensAfterTicks === undefined ? {} : { opensAfterTicks }),
  }
}

function haveOf(rig: Rig, isOwned: boolean): string {
  return isOwned ? rig.id : 'none'
}
