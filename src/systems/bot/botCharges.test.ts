import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { setChargesIntent, STAND_TILE, WALL_TILE } from '../authority/charges/chargeFixtures'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { FREEZE_ENEMIES } from '../authority/scriptedSession'
import { restockPrice } from '../economy/blastingCharges'
import { restockChargesCommand } from '../platform/platformCommands'
import type { TilePoint } from '../world/tileGrid'
import {
  blastOpen,
  isBlastWorthIt,
  noteTileWorthACharge,
  restockPriceFor,
  type ChargePolicy,
} from './botCharges'
import type { BotPlanet } from './botPilot'
import { NO_TICKS, reportPoseIntent } from './botPose'
import { createBotSession, type BotSession } from './botSession'
import { paramsOfSession, tileKindAt } from './botWorld'
import { newMineLayout } from './mineLayout'

const WORLD_SEED = 83921
/** A tile far slower than the 96-tick threshold, and one just at it. */
const HARD_TICKS = 400
const THRESHOLD_TICKS = 96

function freshSession(): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  return createBotSession(start, 'p1')
}

/** The bot docked at the Upgrade bay of planet `planetIndex`, with money to spare. */
function botAtUpgradeBayOn(planetIndex: number): BotSession {
  const session = freshSession()
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

/**
 * The bot in band-2 rock with `carried` charges (three by default), on the stand tile facing the
 * wall east of it, with `openTilesBehind` tiles carved open to the west.
 */
function botAtWall(openTilesBehind: number, chargePolicy: ChargePolicy = 'blast', carried = 3) {
  const session = freshSession()
  session.submit(FREEZE_ENEMIES)
  session.submit(setChargesIntent(carried))
  for (let back = 0; back <= openTilesBehind; back++) carveTile(session, westOf(STAND_TILE, back))
  session.submit(reportPoseIntent(STAND_TILE, 1, NO_TICKS))
  const site = dockSiteOfPlanet(session.state().planet)!
  const planet: BotPlanet = {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    pilot: { position: STAND_TILE, facing: 1 },
    chargePolicy,
    hasMetBlastTile: false,
  }
  return { session, planet }
}

function westOf(tile: TilePoint, tiles: number): TilePoint {
  return { tx: tile.tx - tiles, ty: tile.ty }
}

function carveTile(session: BotSession, tile: TilePoint): void {
  session.submit({
    type: 'debug.carveCircle',
    payload: { x: tile.tx * 1000 + 500, y: tile.ty * 1000 + 500, radius: 500, amount: 255 },
  })
}

describe('bot: blasting charges policy (#109)', () => {
  it('fills the rack at the Upgrade bay from planet 7, and not before', () => {
    expect(restockPriceFor(botAtUpgradeBayOn(6))).toBeNull()
    expect(restockPriceFor(botAtUpgradeBayOn(7))).toEqual(restockPrice(3, 7))
  })

  it('wants no restock with a full rack', () => {
    const full = botAtUpgradeBayOn(7)
    full.submit(restockChargesCommand())
    expect(restockPriceFor(full)).toBeNull()
  })

  it('wants charges once it meets a tile it would blast with none in stock (#129)', () => {
    const { session, planet } = botAtWall(2, 'blast', 0)
    noteTileWorthACharge(session, planet, WALL_TILE, HARD_TICKS)
    expect(planet.hasMetBlastTile).toBe(true)
  })

  it('wants no charges for a tile at the threshold, with one in stock, or without charges', () => {
    const atThreshold = botAtWall(2, 'blast', 0)
    noteTileWorthACharge(atThreshold.session, atThreshold.planet, WALL_TILE, THRESHOLD_TICKS)
    const stocked = botAtWall(2, 'blast', 1)
    noteTileWorthACharge(stocked.session, stocked.planet, WALL_TILE, HARD_TICKS)
    const never = botAtWall(2, 'never', 0)
    noteTileWorthACharge(never.session, never.planet, WALL_TILE, HARD_TICKS)
    const flags = [atThreshold, stocked, never].map(({ planet }) => planet.hasMetBlastTile)
    expect(flags).toEqual([false, false, false])
  })

  it('blasts only a tile slower than 96 ticks, with a charge and an open way back', () => {
    const { session, planet } = botAtWall(2)
    expect(isBlastWorthIt(session, planet, WALL_TILE, HARD_TICKS)).toBe(true)
    expect(isBlastWorthIt(session, planet, WALL_TILE, THRESHOLD_TICKS)).toBe(false)
    const boxedIn = botAtWall(1)
    expect(isBlastWorthIt(boxedIn.session, boxedIn.planet, WALL_TILE, HARD_TICKS)).toBe(false)
    const never = botAtWall(2, 'never')
    expect(isBlastWorthIt(never.session, never.planet, WALL_TILE, HARD_TICKS)).toBe(false)
  })

  it('backs out of the blast, waits for it, and comes back to an open wall unhurt', () => {
    const { session, planet } = botAtWall(2)
    const hull = session.vehicle().hull
    expect(blastOpen(session, planet, WALL_TILE)).toBe(true)
    expect(tileKindAt(session.state(), WALL_TILE)).toBe('open')
    expect(planet.pilot.position).toEqual(STAND_TILE)
    expect(session.vehicle().hull).toEqual(hull)
    expect(session.vehicle().charges).toMatchObject({ carried: 2, planted: null })
    expect(session.events().map((event) => event.type)).not.toContain('CommandRejected')
  })
})
