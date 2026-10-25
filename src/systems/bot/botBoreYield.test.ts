import { describe, expect, it } from 'vitest'
import { BARE_BORE_CELLS_PER_METRE } from '../../constants/balance'
import { createAuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { FREEZE_ENEMIES, GROUND } from '../authority/scriptedSession'
import { drillQuantumAt } from '../authority/stepBoundRead'
import { withDrillSideClearance, WIDE_BORE_CLEARANCE_MM } from '../vehicle/drillBoreFixtures'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { FACING } from '../vehicle/vehiclePose'
import { statsOfVehicle } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { boreTile, enterBoredTile, type BotPilot } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { boreSubSteps, cellOfTile, paramsOfSession, tileKindAt } from './botWorld'

// Why ticket 663 moved no paceScale (the VS on #661: restore lost yield through paceScale first):
// the pacing bot bores one 1 m tile at a time (`drillTile`, the #6 movement-time model), never the
// player's disc, so the bore row that narrowed the player's cut from #36's 1.9 m to 1.2 m leaves
// the bot's shaft, its ore and so every planet's minutes where they were. The player's bare bore
// now opens the bot's own cell a metre (`BARE_BORE_CELLS_PER_METRE`).

const PLAYER = 'p1'
/** Forty cells straight down from the surface of planet 1: band 1 and its ore. */
const COLUMN: readonly TilePoint[] = Array.from({ length: 40 }, (_, depth) => ({
  tx: GROUND.tx,
  ty: GROUND.ty - depth,
}))
/** Drill power purchase 12: about 1.3 ticks a band-1 cell, so the column bores in seconds. */
const DRILL_POWER = 12

/** What a bore left: the tiles it broke and the ore units its hold took, in event order. */
interface BoreYield {
  broken: string[]
  oreUnits: number
}

function botOnSurface(): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit(FREEZE_ENEMIES)
  session.submit(setUpgradeCommand('drill_power', DRILL_POWER))
  return session
}

/** Bores the column top down as the bot bores a shaft. */
function boreColumn(session: BotSession): void {
  const pilot: BotPilot = { position: { tx: GROUND.tx, ty: GROUND.ty + 1 }, facing: FACING.down }
  const quantum = drillQuantumAt(session.state(), PLAYER)
  const drill = statsOfVehicle(session.vehicle())
  const params = paramsOfSession(session.state())
  for (const tile of COLUMN) {
    const subSteps = boreSubSteps(drill, quantum, params, tile, cellOfTile(session.state(), tile))
    boreTile(session, pilot, tile, { subSteps: subSteps ?? 0, quantum })
    enterBoredTile(pilot, tile)
  }
}

function yieldOf(events: readonly DomainEvent[]): BoreYield {
  const broken = events.flatMap((event) =>
    event.type === 'TileDestroyed' ? [keyOfTile(event)] : [],
  )
  const oreUnits = events.reduce(
    (sum, event) => sum + (event.type === 'CargoAdded' ? event.amount : 0),
    0,
  )
  return { broken, oreUnits }
}

function keyOfTile({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

function boreYield(): BoreYield {
  const session = botOnSurface()
  boreColumn(session)
  return yieldOf(session.events())
}

describe('the pacing bot on the 1.2 m bore (ticket 663)', () => {
  it("breaks the same tiles and takes the same ore as on #36's 1.9 m bore", () => {
    const wide = withDrillSideClearance(WIDE_BORE_CLEARANCE_MM, boreYield)
    expect(boreYield()).toEqual(wide)
  })

  it("opens its column's solid cells and none beside them, the bare bore's cell a metre", () => {
    const solid = COLUMN.filter((tile) => tileKindAt(botOnSurface().state(), tile) !== 'open')
    const { broken, oreUnits } = boreYield()
    expect([...broken].sort()).toEqual(solid.map(keyOfTile).sort())
    expect(BARE_BORE_CELLS_PER_METRE).toBe(1)
    expect(oreUnits).toBeGreaterThan(0)
  })
})
