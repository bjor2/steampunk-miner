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
 * bored or entered (ticket 237: the tune, the etch, the pull). A cell a gate cuts below the drill's
 * speed (the blast bit's grind, D5 #864) is bored for its slowed time.
 * A sideways bore waits at least the drive's time over the tile (Bjor's ruling on #723,
 * `sidewaysBores.ts`), and a bore down at least the time local gravity lets the body gain the
 * drill's speed across it (Bjor's ruling on #724, `downBores.ts`); what it can afford and whether
 * a charge pays still read the drill's time.
 * A bore at an aim off the four facings (ticket 899) keeps each part's rule, as the player's
 * diagonal cut does (`vehicle/cutAxisCaps.ts`): its sideways part at least the drive's time over
 * the metre across, then a downward part's ramp along the aim across the √2 m to a diagonal tile.
 * `openTileAlongAim` holds the head at any 1/64-turn aim and opens the player's nose tile there.
 */
import { heatThrottledDrill } from '../authority/heatRules'
import { gatedDrillTimeOf, type GateVerdict } from '../registries/gateChecks'
import { drillQuantumAt } from '../authority/stepBoundRead'
import { isCardinalAim, type Aim } from '../vehicle/aim'
import { isGravityRampedAim } from '../vehicle/cutAxisCaps'
import { driveSpeedOf } from '../vehicle/cutCapSpeed'
import { downCutAccelerationAt } from '../vehicle/radialGravity'
import { isVehicleActive } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { blastOpen, blastShellOpen, isBlastWorthIt, noteTileWorthACharge } from './botCharges'
import { drillGateAt, extractorWaitOf, isShellGate, isWallGate } from './botGates'
import { canAffordBore } from './botEnergy'
import {
  boreAimOf,
  boreTile,
  enterBoredTile,
  moveStraight,
  standBy,
  touchTile,
  type BotPlanet,
} from './botPilot'
import { noseTileAlong } from './botPose'
import type { BotSession } from './botSession'
import {
  entrySpeedOf,
  legAimFieldOf,
  rampedDownBoreOf,
  rampRestTicksOf,
  tallyDownBore,
  type RampedBore,
} from './downBores'
import { drivenBoreAlongOf, tallySidewaysBore } from './sidewaysBores'
import {
  boreSubSteps,
  cellOfTile,
  DIAGONAL_STEP_METRES,
  isBoreLavaRisk,
  isLavaRisk,
  tileKindAt,
} from './botWorld'
import type { TileBore } from './boreClock'

/** Opening a tile: done, impossible for this tip or for the lava, or too dear for the tank. */
export type OpenOutcome = 'opened' | 'blocked' | 'short'

/** A throttled bore tries again at most this many times before giving the tile up. */
const MAX_REBORES = 8

/** Past an extractor's own ticks: the clock acting on them, and a pulled cell's edit landing. */
const EXTRACTOR_SETTLE_TICKS = 2

/**
 * Opens the tile at the drill's nose with the head held at `aim`, any 1/64 turn, and moves into it
 * (ticket 899): the player's nose tile one metre along the aim, bored and reported at that aim.
 */
export function openTileAlongAim(session: BotSession, planet: BotPlanet, aim: Aim): OpenOutcome {
  planet.pilot.aim = aim
  return openTile(session, planet, noseTileAlong(planet.pilot.position, aim))
}

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
  return boreUngated(session, planet, tile, gate)
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
  const gate = drillGateAt(session, tile)
  if (isWallGate(gate)) return 'blocked'
  return boreUngated(session, planet, tile, gate)
}

/** A shell blasted open is entered like a bored tile; one left standing is a wall. */
function outcomeOfOpening(session: BotSession, isOpen: boolean): OpenOutcome {
  if (!isOpen) return 'blocked'
  return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
}

function boreUngated(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
  gate: GateVerdict | null,
): OpenOutcome {
  const bore = tileBoreOf(session, planet, tile, gate)
  if (bore === null) return 'blocked'
  const ticks = Math.ceil(bore.subSteps / bore.quantum)
  if (!canAffordBore(session, planet, ticks)) return 'short'
  // #129: a tile it would blast with an empty rack is what makes its next visit buy charges.
  noteTileWorthACharge(session, planet, tile, ticks)
  // #109: blast it open when that pays; the bot backs off and comes back to the same tile.
  if (isBlastWorthIt(session, planet, tile, ticks) && blastOpen(session, planet, tile)) {
    return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
  }
  boreAlongAim(session, planet, tile, bore)
  return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
}

/**
 * Bores the tile as the rig cuts it from where it stands, along the bore's aim: a cut down at the
 * drill's work, then standing by for the rest of the time gravity takes to bring the body across
 * it (#724); sideways held to the drive (#723); up at the drill's time; at 45° the sideways part
 * held to the drive, then a downward part's ramp (ticket 899).
 */
function boreAlongAim(session: BotSession, planet: BotPlanet, tile: TilePoint, bore: TileBore) {
  const aim = boreAimOf(planet.pilot, tile)
  const driven = sidewaysBoreAt(session, planet, aim, bore)
  if (isGravityRampedAim(aim)) return boreDownUnderRamp(session, planet, { tile, aim }, driven)
  boreTile(session, planet.pilot, tile, driven)
}

/** A bore's tile and the aim it is bored along. */
interface AimedTile {
  tile: TilePoint
  aim: Aim
}

/**
 * A bore down: the drill's own sub-steps on the clock (a 45° bore's held to the drive), so the
 * drill heats and draws for its work alone, as a player's does; then the ramp's remaining ticks
 * stood by; the speed it leaves carried for the tile beyond it along the aim.
 */
function boreDownUnderRamp(
  session: BotSession,
  planet: BotPlanet,
  { tile, aim }: AimedTile,
  bore: TileBore,
): void {
  const startTick = session.tick()
  const ramped = rampedDownBoreAt(session, planet, { tile, aim }, bore)
  boreTile(session, planet.pilot, tile, bore)
  standBy(session, planet.pilot, rampRestTicksOf(ramped.bore, bore, session.tick() - startTick))
  const leg = { tick: session.tick(), tile, speed: ramped.exitSpeed }
  planet.pilot.downLeg = { ...leg, ...legAimFieldOf(aim) }
}

/**
 * A bore down from the leg's speed along its aim, under local gravity at the tile's centre (#724),
 * across the metres the body travels, tallied.
 */
function rampedDownBoreAt(
  session: BotSession,
  planet: BotPlanet,
  { tile, aim }: AimedTile,
  bore: TileBore,
): RampedBore {
  const { pilot, layout } = planet
  const entrySpeed = entrySpeedOf(pilot.downLeg, pilot.position, session.tick(), aim)
  const acceleration = downCutAccelerationAt(
    Math.hypot(tile.tx + 0.5, tile.ty + 0.5),
    layout.params.radiusTiles,
    layout.params.gravityMultiplier,
  )
  const ramped = rampedDownBoreOf(bore, entrySpeed, acceleration, metresAlong(aim))
  if (planet.downBores !== undefined) {
    tallyDownBore(planet.downBores, session.state().planet.index, bore, ramped.bore)
  }
  return ramped
}

/** The metres a bore along `aim` takes the body: one straight down, √2 at 45°. */
function metresAlong(aim: Aim): number {
  return isCardinalAim(aim) ? 1 : DIAGONAL_STEP_METRES
}

/** A bore with a sideways part held to the drive, and tallied; the drill's bore up or down. */
function sidewaysBoreAt(
  session: BotSession,
  planet: BotPlanet,
  aim: Aim,
  bore: TileBore,
): TileBore {
  const driven = drivenBoreAlongOf(bore, aim, driveSpeedOf(session.vehicle()))
  if (driven === bore || planet.sidewaysBores === undefined) return driven
  tallySidewaysBore(planet.sidewaysBores, session.state().planet.index, bore, driven)
  return driven
}

/**
 * The tile's drill time on the scripted clock (ticket 559), at the drill power the heat gauge
 * leaves (#113), in the rig's quantum, slowed as the gate slows the authority's drill (the blast
 * bit, D5 #864); null when the tip cannot scratch it.
 */
function tileBoreOf(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
  gate: GateVerdict | null,
): TileBore | null {
  const state = session.state()
  const drill = heatThrottledDrill(state.planet.index, session.vehicle())
  const quantum = drillQuantumAt(state, session.playerId)
  const cell = cellOfTile(state, tile)
  const subSteps = boreSubSteps(drill, quantum, planet.layout.params, tile, cell)
  return subSteps === null ? null : { subSteps: gatedDrillTimeOf(subSteps, gate), quantum }
}
