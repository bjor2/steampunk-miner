import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import { createAuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { FREEZE_ENEMIES, GROUND } from '../authority/scriptedSession'
import { drillQuantumAt } from '../authority/stepBoundRead'
import { casingLiningPrice } from '../economy/casingPrices'
import { fromSafeInteger, div, toCanonical } from '../money'
import { AIM, type Aim } from '../vehicle/aim'
import { driveSpeedOf, driveSubStepsPerCellOf } from '../vehicle/cutCapSpeed'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { openTileAlongAim } from './botDig'
import { moveStraight, type BotPlanet } from './botPilot'
import { aimTowards, noseTileAlong, reportAimedPoseIntent, reportPoseIntent } from './botPose'
import { createBotSession, type BotSession } from './botSession'
import { botPlanetOf } from './botTravel'
import { tileKindAt } from './botWorld'

// Ticket 899: the pacing bot's tile model digs at any 1/64-turn aim through the player's own dig
// path (#791): it reports the head's aim as the analog stick sends it, and the tile it bores is the
// player's nose tile along that aim, so the casing ring and its bill follow the aim by the
// player's rules (#833) and the bot steps no cells of its own. A 45 degree step is the diagonal
// neighbour, √2 m, billed √2 m of lining.

const PLAYER = 'p1'
/** Drill power purchase 12: about 1.3 ticks a band-1 cell, so a leg bores in seconds. */
const DRILL_POWER = 12
const DOWN_RIGHT: Aim = 56
const DOWN_LEFT: Aim = 40
/** Five steps of 1/64 turn off straight down, toward the right. */
const OFF_AXIS: Aim = 53
const LEG_STEPS = 10
/** A 45 degree step's stretch of tunnel axis: the diagonal of a 1 m tile, to the mm. */
const DIAGONAL_STRETCH_MM = 1414
const NEIGHBOURS: readonly TilePoint[] = [-1, 0, 1].flatMap((dx) =>
  [-1, 0, 1].flatMap((dy) => (dx === 0 && dy === 0 ? [] : [{ tx: dx, ty: dy }])),
)

type CasingLined = Extract<DomainEvent, { type: 'CasingLined' }>

/** The bot just above the surface east of the pad, enemies frozen, with a drill that bores fast. */
function botAboveGround(): { session: BotSession; planet: BotPlanet } {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit(FREEZE_ENEMIES)
  session.submit(setUpgradeCommand('drill_power', DRILL_POWER))
  const planet = botPlanetOf(session, 'never')
  planet.pilot.position = { tx: GROUND.tx, ty: GROUND.ty + 1 }
  return { session, planet }
}

/** Opens `steps` tiles one after another at `aim`, then moves back to where it started. */
function digLegAndBackOut(
  aim: Aim,
  steps = LEG_STEPS,
): { session: BotSession; tiles: TilePoint[] } {
  const { session, planet } = botAboveGround()
  const start = planet.pilot.position
  const tiles: TilePoint[] = []
  for (let step = 0; step < steps; step++) {
    tiles.push(noseTileAlong(planet.pilot.position, aim))
    expect(openTileAlongAim(session, planet, aim)).toBe('opened')
  }
  moveStraight(session, planet, start)
  return { session, tiles }
}

function liningRingsOf(events: readonly DomainEvent[]): CasingLined[] {
  return events.filter((event): event is CasingLined => event.type === 'CasingLined')
}

function lastReportedAimOf(session: BotSession): number | undefined {
  const report = session
    .commands()
    .findLast((command) => command.type === 'reportPose' && command.payload.drilling === false)
  return report?.type === 'reportPose' ? report.payload.aim : undefined
}

describe('pacing bot aims (ticket 899)', () => {
  it('aims at 45 degrees at a diagonal neighbour and at the facing otherwise', () => {
    const from = { tx: 0, ty: 0 }
    expect(aimTowards(from, { tx: 1, ty: -1 })).toBe(56)
    expect(aimTowards(from, { tx: -1, ty: -1 })).toBe(40)
    expect(aimTowards(from, { tx: 1, ty: 1 })).toBe(8)
    expect(aimTowards(from, { tx: -1, ty: 1 })).toBe(24)
    expect(aimTowards(from, { tx: 0, ty: -3 })).toBe(AIM.down)
    expect(aimTowards(from, { tx: 4, ty: 0 })).toBe(AIM.right)
    expect(aimTowards(from, { tx: 3, ty: -1 })).toBe(AIM.right)
  })

  it("finds every neighbour as the player's nose tile along the aim toward it", () => {
    const from = { tx: 7, ty: 40 }
    for (const { tx, ty } of NEIGHBOURS) {
      const neighbour = { tx: from.tx + tx, ty: from.ty + ty }
      expect(noseTileAlong(from, aimTowards(from, neighbour))).toEqual(neighbour)
    }
  })

  it('sends a cardinal aim’s report field for field as its facing’s', () => {
    const facings: readonly Facing[] = [FACING.left, FACING.right, FACING.down, FACING.up]
    const aims: readonly Aim[] = [AIM.left, AIM.right, AIM.down, AIM.up]
    const ticks = { thrustTicks: 3, driveTicks: 0, drillTicks: 0 }
    facings.forEach((facing, index) => {
      const aimed = reportAimedPoseIntent(GROUND, aims[index], ticks)
      expect(JSON.stringify(aimed)).toBe(JSON.stringify(reportPoseIntent(GROUND, facing, ticks)))
    })
  })

  it('reports a 45 degree aim with the facing nearest it and the push down and across', () => {
    const { payload } = reportAimedPoseIntent(GROUND, DOWN_RIGHT)
    expect(payload).toMatchObject({ facing: FACING.right, aim: DOWN_RIGHT, drive: { x: 1, y: -1 } })
  })
})

describe('pacing bot aimed digging (ticket 899)', () => {
  it.each([AIM.down, OFF_AXIS, DOWN_RIGHT, DOWN_LEFT])(
    'bores the player’s nose tile at aim %i, reporting that aim, with every command accepted',
    (aim) => {
      const { session, planet } = botAboveGround()
      const from = planet.pilot.position
      const nose = noseTileAlong(from, aim)
      expect(openTileAlongAim(session, planet, aim)).toBe('opened')
      expect(tileKindAt(session.state(), nose)).toBe('open')
      expect(planet.pilot.position).toEqual(nose)
      expect(lastReportedAimOf(session)).toBe(aim === AIM.down ? undefined : aim)
      expect(session.events().filter((event) => event.type === 'CommandRejected')).toEqual([])
    },
  )

  it('digs a 45 degree leg down the diagonal, one tile across for each tile down', () => {
    const { session, tiles } = digLegAndBackOut(DOWN_RIGHT)
    tiles.forEach((tile, step) => {
      expect(tile).toEqual({ tx: GROUND.tx + step + 1, ty: GROUND.ty - step })
      expect(tileKindAt(session.state(), tile)).toBe('open')
    })
  })

  it('bills each ring of a 45 degree leg √2 m of lining, its path, where a straight leg bills 1 m', () => {
    const diagonal = liningRingsOf(digLegAndBackOut(DOWN_RIGHT).session.events())
    const straight = liningRingsOf(digLegAndBackOut(AIM.down).session.events())
    expect(diagonal.slice(1).map((ring) => ring.lengthMm)).toEqual(
      Array.from({ length: LEG_STEPS - 1 }, () => DIAGONAL_STRETCH_MM),
    )
    expect(straight.slice(1).map((ring) => ring.lengthMm)).toEqual(
      Array.from({ length: LEG_STEPS - 1 }, () => MM_PER_METRE),
    )
  })

  it('prices every ring at the per-metre lining rule, with no term for the angle', () => {
    const rings = [
      ...liningRingsOf(digLegAndBackOut(DOWN_RIGHT).session.events()),
      ...liningRingsOf(digLegAndBackOut(AIM.down).session.events()),
    ]
    expect(rings.length).toBeGreaterThan(0)
    for (const ring of rings) {
      const metres = div(fromSafeInteger(ring.lengthMm), fromSafeInteger(MM_PER_METRE))
      expect(ring.price).toBe(toCanonical(casingLiningPrice(1, ring.band, metres, ring.liningType)))
    }
  })

  it('takes a 45 degree step no faster than the drive crosses its metre to the side', () => {
    const { session, planet } = botAboveGround()
    const quantum = drillQuantumAt(session.state(), PLAYER)
    const driveSubSteps = driveSubStepsPerCellOf(driveSpeedOf(session.vehicle()), quantum)
    const before = session.tick()
    openTileAlongAim(session, planet, DOWN_RIGHT)
    expect(session.tick() - before).toBeGreaterThanOrEqual(Math.floor(driveSubSteps / quantum))
  })

  it('climbs a 45 degree leg on thrust and drive at once, √2 m a step', () => {
    const { session, planet } = botAboveGround()
    const start = planet.pilot.position
    for (let step = 0; step < LEG_STEPS; step++) openTileAlongAim(session, planet, DOWN_RIGHT)
    const climbStart = session.commands().length
    moveStraight(session, planet, start)
    const climb = session
      .commands()
      .slice(climbStart)
      .flatMap((command) => (command.type === 'reportPose' ? [command.payload] : []))
    const thrust = climb.reduce((sum, report) => sum + report.thrustTicks, 0)
    const drive = climb.reduce((sum, report) => sum + report.driveTicks, 0)
    expect(thrust).toBeGreaterThan(0)
    expect(drive).toBe(thrust)
    expect(climb.every((report) => report.aim === 24)).toBe(true)
    expect(planet.pilot.position).toEqual(start)
  })
})
