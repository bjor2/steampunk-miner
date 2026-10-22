/**
 * Opening one neighbouring tile (#29): drive in when it is open, else bore it from where the bot
 * stands for the time the #7 drill rule gives on the scripted sub-step clock (ticket 559), at the
 * drill power the heat gauge leaves (#113), and bore on while the gauge's throttle left the tile standing; a tile worth a blasting charge
 * (#109, `botCharges.ts`) is blasted open instead, and one met with an empty rack makes the next
 * Upgrade bay visit buy charges (#129). A tile whose bore would free lava (its drill gear's cells
 * counted, ticket 392), or the bot's tip cannot scratch, is `blocked`; one the tank cannot afford
 * with the way home, `short`.
 * A cell a gate leaves standing is `blocked` before any bore (#142 acceptance 8), and a dynamite
 * shell is blasted open with a charge that frees it, or `blocked` until it carries one (#142
 * acceptance 9, `botCharges.ts`). A wall its own extractor opens is touched and waited out, then
 * bored or entered (ticket 237: the tune, the etch, the pull).
 * A sideways bore waits at least the drive's time over the tile (Bjor's ruling on #723,
 * `sidewaysBores.ts`), and a bore down at least the time local gravity lets the body gain the
 * drill's speed across it (Bjor's ruling on #724, `downBores.ts`); what it can afford and whether
 * a charge pays still read the drill's time.
 */
import { heatThrottledDrill } from '../authority/heatRules'
import { drillQuantumAt } from '../authority/stepBoundRead'
import { isGravityRampedFacing } from '../vehicle/cutAxisCaps'
import { driveSpeedOf } from '../vehicle/cutCapSpeed'
import { downCutAccelerationAt } from '../vehicle/radialGravity'
import type { Facing } from '../vehicle/vehiclePose'
import { isVehicleActive } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { blastOpen, blastShellOpen, isBlastWorthIt, noteTileWorthACharge } from './botCharges'
import { drillGateAt, extractorWaitOf, isShellGate, isWallGate } from './botGates'
import { canAffordBore } from './botEnergy'
import {
  boreTile,
  enterBoredTile,
  moveStraight,
  standBy,
  touchTile,
  type BotPlanet,
} from './botPilot'
import { facingTowards } from './botPose'
import type { BotSession } from './botSession'
import { entrySpeedOf, rampedDownBoreOf, tallyDownBore, type RampedBore } from './downBores'
import { drivenBoreOf, tallySidewaysBore } from './sidewaysBores'
import { boreSubSteps, cellOfTile, isBoreLavaRisk, isLavaRisk, tileKindAt } from './botWorld'
import type { TileBore } from './boreClock'

/** Opening a tile: done, impossible for this tip or for the lava, or too dear for the tank. */
export type OpenOutcome = 'opened' | 'blocked' | 'short'

/** A throttled bore tries again at most this many times before giving the tile up. */
const MAX_REBORES = 8

/** Past an extractor's own ticks: the clock acting on them, and a pulled cell's edit landing. */
const EXTRACTOR_SETTLE_TICKS = 2

/** Opens a neighbouring tile and moves into it: bores it, or drives in when it is open. */
export function openTile(session: BotSession, planet: BotPlanet, tile: TilePoint): OpenOutcome {
  if (isLavaRisk(session.state(), tile)) return 'blocked'
  if (tileKindAt(session.state(), tile) === 'open') {
    moveStraight(session, planet, tile)
    return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
  }
  const bored = boreInPlace(session, planet, tile)
  if (bored === 'opened') enterBoredTile(planet.pilot, tile)
  return bored
}

/** Bores a neighbouring tile without moving; nothing happens unless it is `opened`. */
export function boreInPlace(session: BotSession, planet: BotPlanet, tile: TilePoint): OpenOutcome {
  if (isBoreLavaRisk(session.state(), session.playerId, planet.pilot.position, tile)) {
    return 'blocked'
  }
  for (let attempt = 0; attempt <= MAX_REBORES; attempt++) {
    const bored = boreOnce(session, planet, tile)
    if (bored !== 'opened' || tileKindAt(session.state(), tile) === 'open') return bored
  }
  return 'blocked'
}

function boreOnce(session: BotSession, planet: BotPlanet, tile: TilePoint): OpenOutcome {
  const gate = drillGateAt(session, tile)
  if (isShellGate(gate)) return outcomeOfOpening(session, blastShellOpen(session, planet, tile))
  const wait = extractorWaitOf(gate)
  if (wait !== null) return openWithExtractor(session, planet, tile, wait)
  if (isWallGate(gate)) return 'blocked'
  return boreUngated(session, planet, tile)
}

/** Touches the wall, waits its extractor out, then finds it open, drillable or still a wall. */
function openWithExtractor(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
  waitTicks: number,
): OpenOutcome {
  touchTile(session, planet.pilot, tile)
  standBy(session, planet.pilot, waitTicks + EXTRACTOR_SETTLE_TICKS)
  if (!isVehicleActive(session.vehicle())) return 'short'
  if (tileKindAt(session.state(), tile) === 'open') return 'opened'
  if (isWallGate(drillGateAt(session, tile))) return 'blocked'
  return boreUngated(session, planet, tile)
}

/** A shell blasted open is entered like a bored tile; one left standing is a wall. */
function outcomeOfOpening(session: BotSession, isOpen: boolean): OpenOutcome {
  if (!isOpen) return 'blocked'
  return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
}

function boreUngated(session: BotSession, planet: BotPlanet, tile: TilePoint): OpenOutcome {
  const bore = tileBoreOf(session, planet, tile)
  if (bore === null) return 'blocked'
  const ticks = Math.ceil(bore.subSteps / bore.quantum)
  if (!canAffordBore(session, planet, ticks)) return 'short'
  // #129: a tile it would blast with an empty rack is what makes its next visit buy charges.
  noteTileWorthACharge(session, planet, tile, ticks)
  // #109: blast it open when that pays; the bot backs off and comes back to the same tile.
  if (isBlastWorthIt(session, planet, tile, ticks) && blastOpen(session, planet, tile)) {
    return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
  }
  const driven = drivenBoreAt(session, planet, tile, bore)
  boreTile(session, planet.pilot, tile, driven.bore)
  planet.pilot.downLeg = { tick: session.tick(), tile, speed: driven.exitSpeed }
  return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
}

/**
 * The bore as the rig cuts it from where it stands, a cut down ramped by gravity and sideways held
 * to the drive, each tallied, with the speed down it leaves the body at (0 off a cut down).
 */
function drivenBoreAt(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
  bore: TileBore,
): RampedBore {
  const facing = facingTowards(planet.pilot.position, tile)
  if (isGravityRampedFacing(facing)) return rampedDownBoreAt(session, planet, tile, bore)
  return { bore: sidewaysBoreAt(session, planet, facing, bore), exitSpeed: 0 }
}

/** A bore down from the leg's speed, under local gravity at the tile's centre (#724), tallied. */
function rampedDownBoreAt(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
  bore: TileBore,
): RampedBore {
  const { pilot, layout } = planet
  const entrySpeed = entrySpeedOf(pilot.downLeg, pilot.position, session.tick())
  const acceleration = downCutAccelerationAt(
    Math.hypot(tile.tx + 0.5, tile.ty + 0.5),
    layout.params.radiusTiles,
    layout.params.gravityMultiplier,
  )
  const ramped = rampedDownBoreOf(bore, entrySpeed, acceleration)
  if (planet.downBores !== undefined) {
    tallyDownBore(planet.downBores, session.state().planet.index, bore, ramped.bore)
  }
  return ramped
}

/** A sideways bore held to the drive, and tallied; the drill's bore up. */
function sidewaysBoreAt(
  session: BotSession,
  planet: BotPlanet,
  facing: Facing,
  bore: TileBore,
): TileBore {
  const driven = drivenBoreOf(bore, facing, driveSpeedOf(session.vehicle()))
  if (driven === bore || planet.sidewaysBores === undefined) return driven
  tallySidewaysBore(planet.sidewaysBores, session.state().planet.index, bore, driven)
  return driven
}

/**
 * The tile's drill time on the scripted clock (ticket 559), at the drill power the heat gauge
 * leaves (#113), in the rig's quantum; null when the tip cannot scratch it.
 */
function tileBoreOf(session: BotSession, planet: BotPlanet, tile: TilePoint): TileBore | null {
  const state = session.state()
  const drill = heatThrottledDrill(state.planet.index, session.vehicle())
  const quantum = drillQuantumAt(state, session.playerId)
  const cell = cellOfTile(state, tile)
  const subSteps = boreSubSteps(drill, quantum, planet.layout.params, tile, cell)
  return subSteps === null ? null : { subSteps, quantum }
}
