import { describe, expect, it } from 'vitest'
import type { AuthorityCommand, CommandIntent } from '../../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { WORLD_SEED } from '../../../systems/authority/scriptedSession'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { replayRun } from '../../../systems/replay/replayRun'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { chargesLeftOf, type PowerUpUse } from '../../power-up-core'
import {
  ACT_TICK,
  DRAIN_ID,
  drainSessionAt,
  MM,
  oreTilesAround,
  poseAt,
  press,
  PRESS_TICK,
  standingTileWithOre,
} from '../drainTestSession'
import { EXTRACTION_POWER_UPS } from './extractionContent'

// The mineral drain's Mark milestone (the GD lock on #256, build 5): a channel's Mark 3 second
// tap, pressed 20 ticks after the first drain acted. Its Mark 6 link waits for the held slurry
// siphon. The drain unlocks on planet 9, so Mark N is researched from planet 9 + 3 (N - 1).

const ORIGIN = standingTileWithOre(5)
const FOLLOW_TICK = ACT_TICK + 20
/** The second tap channels for 60 ticks too. */
const END_TICK = FOLLOW_TICK + 80
const PLANET_OF_MARK: Readonly<Record<number, number>> = { 2: 12, 3: 15 }
const POCKET_RADIUS_MM = 1200

function commandsOf(intents: readonly (readonly [number, CommandIntent])[]): AuthorityCommand[] {
  return intents.map(
    ([tick, intent], index) =>
      ({ playerId: 'p1', tick, seq: index + 1, ...intent }) as AuthorityCommand,
  )
}

/** The drain used at tick 10 and pressed again 20 ticks after it acted, jumped and at 30 and 144. */
function tappedTwiceAt(mark: number) {
  const centre = { x: ORIGIN.tx * MM + MM / 2, y: ORIGIN.ty * MM + MM / 2 }
  const commands = commandsOf([
    [0, { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: PLANET_OF_MARK[mark] } }],
    [0, setVehicleLoadoutCommand({ 'powerup.1': DRAIN_ID })],
    [1, carveCircleCommand({ ...centre, radius: POCKET_RADIUS_MM, amount: SOLID_DENSITY })],
    [2, poseAt(ORIGIN)],
    [PRESS_TICK, press()],
    [FOLLOW_TICK, press()],
  ] as (readonly [number, CommandIntent])[])
  return [undefined, 30, 144].map((framesPerSecond) =>
    replayRun(WORLD_SEED, commands, { endTick: END_TICK, framesPerSecond }),
  )
}

/** Each power-up line of the run: used (with its milestone), refused (with why), or rejected. */
function useLinesOf(events: readonly DomainEvent[]): string[] {
  return events.flatMap((event) => {
    if (event.type === 'power-up-core.PowerUpUsed') return [`used ${event.milestone ?? 'plain'}`]
    if (event.type === 'power-up-core.PowerUpRefused') return [`refused ${event.reason}`]
    if (event.type === 'CommandRejected') return [`rejected ${event.reason}`]
    return []
  })
}

/** The tiles one drain from `ORIGIN` takes when its use is `milestone`, in the order it takes them. */
function tilesTaken(milestone: PowerUpUse['milestone']): TilePoint[] {
  const session = drainSessionAt(ORIGIN)
  session.advanceTo(PRESS_TICK)
  const [drain] = EXTRACTION_POWER_UPS
  const use: PowerUpUse = {
    playerId: 'p1',
    itemId: DRAIN_ID,
    slot: 'powerup.1',
    tick: ACT_TICK,
    origin: ORIGIN,
    mark: 3,
    magnitude: 2,
    ...(milestone !== undefined && { milestone }),
  }
  const outcome = drain.activate(session.state(), use)
  if (outcome.kind !== 'acted') throw new Error(`the drain did not act: ${outcome.kind}`)
  const edits = outcome.effect.state.terrainEdits
  return (edits[edits.length - 1]?.cells ?? []).map(({ tx, ty }) => ({ tx, ty }))
}

const distanceSq = (tile: TilePoint) => (tile.tx - ORIGIN.tx) ** 2 + (tile.ty - ORIGIN.ty) ** 2

describe('mineral drain Mark milestones (#256)', () => {
  it('at M3 the second press is a second tap and at M2 the same press waits out the cooldown, at 30 and 144 steps/s', () => {
    const atMark3 = tappedTwiceAt(3).map((run) => useLinesOf(run.events))
    expect(atMark3[1]).toEqual(atMark3[0])
    expect(atMark3[2]).toEqual(atMark3[0])
    // Planet 1's trip cap is spent by the first drain: the second tap channels, is refused by the
    // cap and costs nothing, as any drain at the cap is.
    expect(atMark3[0]).toEqual(['used plain', 'refused extraction.drain_capped'])

    const atMark2 = tappedTwiceAt(2).map((run) => useLinesOf(run.events))
    expect(atMark2[1]).toEqual(atMark2[0])
    expect(atMark2[0]).toEqual(['used plain', 'rejected power-up-core.cooling_down'])
  })

  it('a refused second tap costs nothing', () => {
    const [run] = tappedTwiceAt(3)
    expect(chargesLeftOf(run.state, 'p1', DRAIN_ID)).toBe(
      chargesLeftOf(tappedTwiceAt(2)[0].state, 'p1', DRAIN_ID),
    )
  })

  it('the second tap drains from the rim of its reach inward, the same count of cells', () => {
    const plain = tilesTaken(undefined)
    const secondTap = tilesTaken('second-tap')
    expect(secondTap).toHaveLength(plain.length)
    expect(plain.map(distanceSq)).toEqual(
      oreTilesAround(ORIGIN).slice(0, plain.length).map(distanceSq),
    )
    expect(Math.min(...secondTap.map(distanceSq))).toBeGreaterThan(
      Math.max(...plain.map(distanceSq)),
    )
  })

  it('the card names the second tap until it is researched, then all reached', () => {
    const state = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
    const lineAt = (level: number) =>
      describeItem(
        { kind: 'vehicle-item', id: DRAIN_ID },
        { playerId: 'p1', planetIndex: 1, level, view: itemSnapshotViewOf(state, 'p1') },
      )?.statLines.find((line) => line.label === 'Next milestone')?.now
    expect(lineAt(1)).toBe('Mk III, tap twice: drains from the rim of its reach inward')
    expect(lineAt(3)).toBe('All reached')
  })
})
