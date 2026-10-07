/**
 * The two extractors that keep a freed cell's ore from getting away (#142 "The extraction rigs"):
 *
 * - **Containment Hood:** a cell the drill frees fills one of the dive's `canistersPerDive`
 *   canisters; with none left the cell vents (`canMine` says lost). The recharge at the dock
 *   refills them free, with the dive's etch marks (`refillExtractorsAtDock`).
 * - **Aether Tether:** the freed lump is harpooned and towed, `lumpsInTow` at a time, and goes with
 *   the hold: sold at the Sell bay, or lost with it on a tow home. A lump freed while the cable is
 *   full drifts off.
 *
 * A drill command's verdicts are read off the state it started from, so every cell one command
 * frees with a canister free (or the cable empty) is kept; the counts never pass their caps.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEventBody } from '../../../systems/authority/domainEvent'
import type { DockService } from '../../../systems/registries/dockServices'
import type { OreType } from '../../../systems/registries/oreTypes'
import type { TilePoint } from '../../../systems/world/tileGrid'
import {
  extractorStateOf,
  withExtractorState,
  withWork,
  type ExtractorState,
} from './extractorState'
import { VERB_ROWS } from './verbRows'
import './verbEvents'

const CAPTURE = VERB_ROWS.capture
const TOW = VERB_ROWS.tow

export const REFILL_EXTRACTORS_SERVICE: DockService = {
  id: 'mining-gates.refill-extractors',
  onRecharge: refillExtractorsAtDock,
}

export function hasCanisterLeft(value: ExtractorState): boolean {
  return value.canistersUsed < CAPTURE.canistersPerDive
}

export function hasCableFree(value: ExtractorState): boolean {
  return (value.tow === null ? 0 : 1) < TOW.lumpsInTow
}

/** One canister filled with a freed cell's ore, up to the rack. */
export function fillCanister(
  value: ExtractorState,
  tile: TilePoint,
  tick: number,
): { value: ExtractorState; events: DomainEventBody[] } {
  const canistersUsed = Math.min(CAPTURE.canistersPerDive, value.canistersUsed + 1)
  const filled = withWork({ ...value, canistersUsed }, CAPTURE.rig, {
    fromTick: tick,
    toTick: tick,
  })
  return {
    value: filled,
    events: [
      {
        type: 'mining-gates.CanisterFilled',
        tx: tile.tx,
        ty: tile.ty,
        canistersLeft: CAPTURE.canistersPerDive - canistersUsed,
      },
    ],
  }
}

/** The freed lump on the cable, unless one is towed already. */
export function harpoonLump(
  value: ExtractorState,
  tile: TilePoint,
  ore: OreType,
  tick: number,
): { value: ExtractorState; events: DomainEventBody[] } {
  if (value.tow !== null) return { value, events: [] }
  const towing = { ...value, tow: { oreId: ore.id, tier: ore.tier, sinceTick: tick } }
  return {
    value: withWork(towing, TOW.rig, { fromTick: tick, toTick: tick }),
    events: [
      {
        type: 'mining-gates.LumpHarpooned',
        tx: tile.tx,
        ty: tile.ty,
        oreId: ore.id,
        tier: ore.tier,
      },
    ],
  }
}

/** The cable is free again once the hold it went with is sold or lost. */
export function releaseTow(value: ExtractorState): ExtractorState {
  return value.tow === null ? value : { ...value, tow: null }
}

function refillExtractorsAtDock(state: AuthorityState, playerId: string): RuleEffect {
  const value = extractorStateOf(state, playerId)
  if (value.canistersUsed === 0 && value.marksUsed === 0) return unchanged(state)
  const refilled: DomainEventBody = {
    type: 'mining-gates.ExtractorsRefilled',
    canisters: value.canistersUsed,
    marks: value.marksUsed,
  }
  return {
    state: withExtractorState(state, playerId, { ...value, canistersUsed: 0, marksUsed: 0 }),
    events: [refilled],
  }
}
