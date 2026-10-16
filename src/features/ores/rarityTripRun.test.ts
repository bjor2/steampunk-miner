import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../../systems/authority/authorityCommand'
import { vehicleOf } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { oreSalePrice, oreTier } from '../../systems/economy/oreEconomy'
import { toCanonical } from '../../systems/money'
import { replayRun } from '../../systems/replay/replayRun'
import { statsOfVehicle } from '../../systems/vehicle/vehicleState'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import {
  BAND_5_RUN,
  CLAMPED_BANDS,
  modelTripOf,
  pickupFindAt,
  RARITY_RUN_PLANET,
  rarityRunScriptOf,
  stampedRunParamsOf,
  type RarityRunScript,
} from './rarityTripFixtures'
import { rarityTripOf } from './systems/rarityTripSection'

// The epic and mythic trip clamp in the real pickup path (ticket 509; TD ruling 6221725921 on
// #445, section 6): a seeded P3 band-5 run that passes the cap replays to the same digests at any
// frame rate, and what the hold is paid matches the ledger model over the pinned seeds.

const stamped = (script: RarityRunScript): AuthorityCommand[] =>
  script.commands.map(
    ({ tick, ...intent }, index) =>
      ({ playerId: 'p1', tick, seq: index + 1, ...intent }) as AuthorityCommand,
  )

const runOf = (script: RarityRunScript, framesPerSecond?: number) =>
  replayRun(script.worldSeed, stamped(script), { endTick: script.endTick, framesPerSecond })

const cargoAddedOf = (events: readonly DomainEvent[]) =>
  events.filter(
    (event): event is Extract<DomainEvent, { type: 'CargoAdded' }> => event.type === 'CargoAdded',
  )

const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('ores: the rarity trip clamp in a seeded run', () => {
  it('replays a P3 band-5 run that forces the clamp to the same digests at 30 and 144 fps', () => {
    const script = rarityRunScriptOf(BAND_5_RUN.seed, BAND_5_RUN.bands)
    const straight = runOf(script)
    for (const framesPerSecond of [30, 144]) {
      const framed = runOf(script, framesPerSecond)
      expect(framed.digests).toEqual(straight.digests)
      expect(framed.events).toEqual(straight.events)
    }
  })

  it.each(SEEDS)('pays the hold what the ledger model pays on seed %i', (seed) => {
    const script = rarityRunScriptOf(seed, CLAMPED_BANDS)
    const run = runOf(script)
    const params = stampedRunParamsOf(seed)
    const capacity = statsOfVehicle(vehicleOf(run.state, 'p1')).cargoCapacity
    const model = modelTripOf(
      script.tiles.map((tile) => pickupFindAt(params, tile)),
      capacity,
    )
    expect(cargoAddedOf(run.events).map((event) => event.value)).toEqual(
      model.values.map(toCanonical),
    )
    expect(rarityTripOf(run.state, 'p1')).toEqual(model.trip)
  })

  it('pays the first band-5 epics in full and every one past the cap at the band ore', () => {
    const script = rarityRunScriptOf(BAND_5_RUN.seed, BAND_5_RUN.bands)
    const params = stampedRunParamsOf(BAND_5_RUN.seed)
    const fullPrices = script.tiles.map((tile) => oreSalePrice(pickupFindAt(params, tile).saleTier))
    const bandPrice = oreSalePrice(oreTier(RARITY_RUN_PLANET, 5))
    // 0.15 x 90 x V(11) holds four epics at floorMilli(V(14)) exactly (rarityTripClamp.test).
    const expected = fullPrices.map((full, index) => (index < 4 ? full : bandPrice))
    expect(cargoAddedOf(runOf(script).events).map((event) => event.value)).toEqual(
      expected.map(toCanonical),
    )
  })
})
