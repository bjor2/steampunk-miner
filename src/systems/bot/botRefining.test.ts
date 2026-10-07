import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import type { CommandIntent } from '../authority/authorityCommand'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { onCurveLevel } from '../economy/vehicleStats'
import { digestsOf, replayRun } from '../replay/replayRun'
import { setPlanetCommand, setPlanetSeedCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { playSlice, type SliceRun } from './playSlice'
import type { RefineryUse } from './botRefining'
import { stepOfMajor } from '../economy/upgradeSteps'

const WORLD_SEED = 83921
/** Fifteen minutes on planet 3: several dock cycles, each past a 180 s batch. */
const BUDGET_TICKS = 15 * 60 * 60

/** On planet 3 with the on-curve levels and money a bot arriving there would have. */
const ARRIVED_ON_PLANET_3: CommandIntent[] = [
  setPlanetCommand(3),
  setPlanetSeedCommand(WORLD_SEED),
  { type: 'debug.setMoney', payload: { amount: '2000' } },
  ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, 3)))),
]

const runs = new Map<RefineryUse, SliceRun>()

function planet3Run(refinery: RefineryUse): SliceRun {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const run =
    runs.get(refinery) ??
    playSlice(start, {
      maxTicks: BUDGET_TICKS,
      lastPlanet: 3,
      startCommands: ARRIVED_ON_PLANET_3,
      refinery,
    })
  runs.set(refinery, run)
  return run
}

const typesOf = (run: SliceRun) => run.events.map((event) => event.type)

describe('pacing bot refining (#105)', () => {
  it('queues its haul at the Refinery bay and collects ready batches at the Sell bay', () => {
    const types = typesOf(planet3Run('used'))
    expect(types.filter((type) => type === 'RefineQueued').length).toBeGreaterThan(1)
    expect(types).toContain('RefineCollected')
  })

  it('sends only commands the authority accepts while refining', () => {
    expect(typesOf(planet3Run('used'))).not.toContain('CommandRejected')
  })

  it('replays a refining run to the same digests and state', () => {
    const { commands, events, state } = planet3Run('used')
    const replayed = replayRun(WORLD_SEED, commands, { endTick: state.tick })
    expect(replayed.digests.slice(0, -1)).toEqual(digestsOf(events))
    expect(replayed.state).toEqual(state)
  })

  it('never refines when the run ignores the refinery', () => {
    expect(typesOf(planet3Run('ignored'))).not.toContain('RefineQueued')
  })
})
