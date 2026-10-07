import { describe, expect, it } from 'vitest'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import type { SliceRun } from '../../systems/bot/playSlice'
import {
  coreRunOn,
  coreTicksOf,
  median,
  MIN_PACE_RATIO,
  PACE_PLANETS,
  PACE_SEEDS,
} from './drillGearPaceRuns'
import { TWIN_BIT_ID } from './systems/twinBit'

// `balance:twin-bit` (GD lock on #257, build 3, ticket 281): the pacing bot arrives on planets 7
// and 10 with on-curve levels and plays to the core twice on each pacing seed, once with the
// twin-bit head in `drill.head` and once with the same loadout command slotting nothing, so both
// runs stamp the same `seq`s. Two asserts on the same runs:
// - the #205 assert applied to the head: the median of the per-seed ratios (with the head over
//   without) stays at or above 0.98;
// - no free cell (GD ruling on #280, Vertical's test): the bot drives straight down (drive x 0), so
//   with the head it mines exactly the cells it mines without, on the same ticks, for the same ore
//   value. An exact match, not the 0.98x tolerance.
// Long: a dozen bot runs, for the box Tester (`npm run balance:twin-bit`).

const TIMEOUT_MS = 60 * 60 * 1000

const MOUNTED_HEAD = [setVehicleLoadoutCommand({ 'drill.head': TWIN_BIT_ID })]
const BARE_HEAD = [setVehicleLoadoutCommand({})]

interface HeadRuns {
  seed: number
  bare: SliceRun
  mounted: SliceRun
}

const runsByPlanet = new Map<number, HeadRuns[]>()

/** Both runs on every pacing seed, played once per planet for the two asserts. */
function headRunsOn(planet: number): HeadRuns[] {
  const cached = runsByPlanet.get(planet)
  if (cached !== undefined) return cached
  const runs = PACE_SEEDS.map((seed) => playHeadRuns(planet, seed))
  runsByPlanet.set(planet, runs)
  return runs
}

function playHeadRuns(planet: number, seed: number): HeadRuns {
  const runs = {
    seed,
    bare: coreRunOn(planet, seed, BARE_HEAD),
    mounted: coreRunOn(planet, seed, MOUNTED_HEAD),
  }
  const ticks = `bare ${coreTicksOf(runs.bare)}, twin bit ${coreTicksOf(runs.mounted)} ticks`
  console.log(`P${planet} seed ${seed}: ${ticks}`)
  return runs
}

type MinedStep =
  | { tick: number; tx: number; ty: number; kind: string }
  | { tick: number; oreId: string; value: string }

/** Each cell dug and each ore unit banked, in order, with its tick: the run's mined sequence. */
function minedSequenceOf(events: readonly DomainEvent[]): MinedStep[] {
  return events.flatMap(minedStepsOf)
}

function minedStepsOf(event: DomainEvent): MinedStep[] {
  if (event.type === 'TileDestroyed') {
    return [{ tick: event.tick, tx: event.tx, ty: event.ty, kind: event.kind }]
  }
  if (event.type === 'CargoAdded')
    return [{ tick: event.tick, oreId: event.oreId, value: event.value }]
  return []
}

describe('twin-bit pace (balance:twin-bit, GD lock on #257)', () => {
  it.each(PACE_PLANETS)(
    'reaches planet %i core no faster than 0.98x the bare time with the twin bit mounted',
    (planet) => {
      const ratios = headRunsOn(planet).map(
        ({ bare, mounted }) => coreTicksOf(mounted) / coreTicksOf(bare),
      )
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_PACE_RATIO)
    },
    TIMEOUT_MS,
  )

  it.each(PACE_PLANETS)(
    'mines exactly the bare cell sequence on planet %i with the head mounted and drive 0',
    (planet) => {
      for (const { seed, bare, mounted } of headRunsOn(planet)) {
        expect({ seed, ticks: coreTicksOf(mounted) }).toEqual({ seed, ticks: coreTicksOf(bare) })
        expect(minedSequenceOf(mounted.events)).toEqual(minedSequenceOf(bare.events))
      }
    },
    TIMEOUT_MS,
  )
})
