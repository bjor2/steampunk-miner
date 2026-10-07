import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import type { CommandIntent } from '../authority/authorityCommand'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { onCurveLevel } from '../economy/vehicleStats'
import { digestsOf, replayRun } from '../replay/replayRun'
import { setPlanetCommand, setPlanetSeedCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import type { ChargePolicy } from './botCharges'
import { playSlice, type SliceRun } from './playSlice'
import { stepOfMajor } from '../economy/upgradeSteps'

const WORLD_SEED = 83921
/** Fifteen minutes on planet 7: enough dock cycles to restock and blast. */
const BUDGET_TICKS = 15 * 60 * 60
/** A drill this far behind the curve meets tiles over the 96-tick threshold (#109 bot policy). */
const DRILL_LEVELS_BEHIND = 12
const DRILL_TRACKS: readonly UpgradeId[] = ['drill_power', 'drill_tip']

/**
 * On planet 7 with on-curve levels but a lagging drill, a full rack of 8 and little money, so the
 * drill stays behind long enough to meet slow tiles (a rack refill costs about 450k there).
 */
const ARRIVED_ON_PLANET_7: CommandIntent[] = [
  setPlanetCommand(7),
  setPlanetSeedCommand(WORLD_SEED),
  { type: 'debug.setMoney', payload: { amount: '5000' } },
  { type: 'debug.setCharges', payload: { size: 1, carried: 8, slotLevel: 5 } },
  ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, arrivalLevel(id))),
]

function arrivalLevel(upgradeId: UpgradeId): number {
  const onCurve = onCurveLevel(upgradeId, 7)
  return stepOfMajor(DRILL_TRACKS.includes(upgradeId) ? onCurve - DRILL_LEVELS_BEHIND : onCurve)
}

const runs = new Map<ChargePolicy, SliceRun>()

function planet7Run(chargePolicy: ChargePolicy): SliceRun {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const run =
    runs.get(chargePolicy) ??
    playSlice(start, {
      maxTicks: BUDGET_TICKS,
      lastPlanet: 7,
      startCommands: ARRIVED_ON_PLANET_7,
      chargePolicy,
    })
  runs.set(chargePolicy, run)
  return run
}

const typesOf = (run: SliceRun) => run.events.map((event) => event.type)

describe('pacing bot blasting (#109 bot policy)', () => {
  it('blasts tiles slower than the threshold on planet 7, unhurt by its own charges', () => {
    const run = planet7Run('blast')
    expect(typesOf(run).filter((type) => type === 'ChargeDetonated').length).toBeGreaterThan(0)
    const blastHits = run.events.filter(
      (event) => event.type === 'VehicleDamaged' && event.source === 'blast',
    )
    expect(blastHits).toEqual([])
  })

  it('sends only commands the authority accepts while blasting', () => {
    expect(typesOf(planet7Run('blast'))).not.toContain('CommandRejected')
  })

  it('replays a blasting run to the same digests and state', () => {
    const { commands, events, state } = planet7Run('blast')
    const replayed = replayRun(WORLD_SEED, commands, { endTick: state.tick })
    expect(replayed.digests.slice(0, -1)).toEqual(digestsOf(events))
    expect(replayed.state).toEqual(state)
  })

  it('never plants a charge when the run plays without them', () => {
    expect(typesOf(planet7Run('never'))).not.toContain('ChargePlanted')
  })
})
