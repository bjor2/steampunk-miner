/**
 * The extractors at work, as an authority reaction (#219, ticket 237): what the drill's touch and
 * its freed cells set going, folded into the player's `mining-gates` section with the events they
 * raise.
 *
 * - A touch the gate refused on a cell of an owned extractor (`DrillGated`, refused, `rig`) starts
 *   its verb there: the fork tunes, the etcher sprays a mark, the coil takes hold.
 * - A cell of an owned extractor the drill freed (`TileDestroyed`, not lost) fills a canister or
 *   goes on the tether's cable.
 * - The hold sold or lost on a tow frees the cable; moving to another planet (or seed) forgets
 *   every tile.
 *
 * Cells and gates are read on the state before the step, as the ledger reads them. With no
 * extractor owned nothing changes, so the section stays at its initial value.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { OreType } from '../../../systems/registries/oreTypes'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { fillCanister, harpoonLump, releaseTow } from './captureAndTow'
import { cellGateOf } from './cellGates'
import { sprayMark } from './etching'
import {
  extractorStateOf,
  withExtractorState,
  withPlanetForgotten,
  type ExtractorState,
} from './extractorState'
import { isLostAt } from './gateLedger'
import type { Rig } from './gateRows'
import { startPull } from './pulling'
import { ownsRig } from './rigs'
import { startTuning } from './tuning'
import { verbOfRig } from './verbRows'

export const EXTRACTOR_VERBS_ID = 'mining-gates.extractor-verbs'

export const extractorVerbs: AuthorityReaction = { id: EXTRACTOR_VERBS_ID, react: workExtractors }

/** What the step's events did to one player's extractors. */
interface Worked {
  value: ExtractorState
  events: DomainEventBody[]
}

/** Who heard what, and on which planet's cells. */
interface Hearing {
  before: AuthorityState
  params: PlanetParams
  playerId: string
  heard: readonly DomainEvent[]
}

function workExtractors(
  before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  if (isPlanetLeft(before, after)) return forgetPlanet(after)
  const hearing = hearingOf(before, heard)
  if (hearing === null) return unchanged(after)
  return workedInto(
    after,
    hearing.playerId,
    heard.reduce(workedBy(hearing), startOf(after, hearing)),
  )
}

function hearingOf(before: AuthorityState, heard: readonly DomainEvent[]): Hearing | null {
  const playerId = heard[0]?.playerId
  const params = planetParamsOf(before.planet)
  if (playerId === undefined || params === null || !(playerId in before.players)) return null
  return { before, params, playerId, heard }
}

function startOf(after: AuthorityState, { playerId }: Hearing): Worked {
  return { value: extractorStateOf(after, playerId), events: [] }
}

function workedInto(after: AuthorityState, playerId: string, worked: Worked): RuleEffect {
  if (worked.value === extractorStateOf(after, playerId)) return unchanged(after)
  return { state: withExtractorState(after, playerId, worked.value), events: worked.events }
}

/** One event's work on the running value. */
function workedBy(hearing: Hearing): (worked: Worked, event: DomainEvent) => Worked {
  return (worked, event) => {
    if (event.type === 'DrillGated' && event.outcome === 'refused' && event.gateKind === 'rig') {
      return touched(hearing, worked, event, event.tick)
    }
    if (isFreedOre(hearing, event)) return freed(hearing, worked, event, event.tick)
    if (event.type === 'ResourceSold' || event.type === 'RescueTriggered') {
      return { ...worked, value: releaseTow(worked.value) }
    }
    return worked
  }
}

type Destroyed = Extract<DomainEvent, { type: 'TileDestroyed' }>

function isFreedOre({ heard }: Hearing, event: DomainEvent): event is Destroyed {
  return (
    event.type === 'TileDestroyed' &&
    event.kind === 'ore' &&
    event.cause === undefined &&
    !isLostAt(heard, event)
  )
}

/** The verb a touch starts: tune, mark or pull; the other two wait for a freed cell. */
function touched(hearing: Hearing, worked: Worked, tile: TilePoint, tick: number): Worked {
  const rig = ownedRigAt(hearing, tile)
  if (rig === null) return worked
  const verb = verbOfRig(rig)
  if (verb === 'tune') return { ...worked, value: startTuning(worked.value, tile, tick) }
  if (verb === 'pull') return { ...worked, value: startPull(worked.value, tile, tick) }
  if (verb === 'mark') return withMore(worked, sprayMark(worked.value, tile, tick))
  return worked
}

/** A freed cell of an owned hood or tether: a canister filled, or a lump on the cable. */
function freed(hearing: Hearing, worked: Worked, tile: TilePoint, tick: number): Worked {
  const ore = oreTypeAtTile(hearing.before, tile)
  const rig = ore === null ? null : ownedRigOf(hearing, tile, ore)
  if (ore === null || rig === null) return worked
  const verb = verbOfRig(rig)
  if (verb === 'capture') return withMore(worked, fillCanister(worked.value, tile, tick))
  if (verb === 'tow') return withMore(worked, harpoonLump(worked.value, tile, ore, tick))
  return worked
}

function ownedRigAt(hearing: Hearing, tile: TilePoint): Rig | null {
  const ore = oreTypeAtTile(hearing.before, tile)
  return ore === null ? null : ownedRigOf(hearing, tile, ore)
}

function ownedRigOf({ before, params, playerId }: Hearing, tile: TilePoint, ore: OreType) {
  const gate = cellGateOf(params, tile, ore)
  if (gate.kind !== 'rig' || !ownsRig(before, playerId, gate.rig.id)) return null
  return gate.rig
}

function withMore(worked: Worked, step: { value: ExtractorState; events: DomainEventBody[] }) {
  return { value: step.value, events: [...worked.events, ...step.events] }
}

/** Travel, or a scenario moving the session: the index or the seed changed. */
function isPlanetLeft(before: AuthorityState, after: AuthorityState): boolean {
  return before.planet.index !== after.planet.index || before.planet.seed !== after.planet.seed
}

/** Every player's tiles forgotten: they were the planet just left. */
function forgetPlanet(after: AuthorityState): RuleEffect {
  const state = Object.keys(after.players).reduce((current, playerId) => {
    const value = extractorStateOf(current, playerId)
    return withExtractorState(current, playerId, withPlanetForgotten(value))
  }, after)
  return unchanged(state)
}
