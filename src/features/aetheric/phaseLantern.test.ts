import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import type { AuthorityCommand, CommandIntent } from '../../systems/authority/authorityCommand'
import { vehicleOf, type AuthorityState } from '../../systems/authority/authorityState'
import { gateOfTile } from '../../systems/authority/cellGates'
import {
  corridorCommands,
  freezeEnemies,
  poseAt,
  setPlanet,
  spawnEnemy,
} from '../../systems/authority/combat/combatFixtures'
import { ticksPerCell } from '../../systems/authority/groundDrill'
import { heatThrottledDrill } from '../../systems/authority/heatRules'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import {
  coreTiles,
  createScriptedSession,
  SITE,
  WORLD_SEED,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { slotHoldEndOf } from '../../systems/registries/slotHoldCues'
import { vehicleMotionAt } from '../../systems/registries/vehicleMotionEffects'
import { replayRun } from '../../systems/replay/replayRun'
import { ENERGY_QUANTA_PER_TICK } from '../../systems/vehicle/energyQuanta'
import { FACING, tileOfMillimetres } from '../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../systems/world/planetParams'
import { SOLID_DENSITY } from '../../systems/world/sampleGrid'
import { surfaceRowOfColumn, type TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { isTileYielded, materialCellAt } from '../../systems/world/worldState'
import { chargesLeftOf, intentToUseSlot, powerUpOfItem } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import {
  CELL_DENSE,
  CELL_GATED,
  CELL_LOCKED,
  CORE_CELL,
  ENERGY_SHORT,
  NO_LANDING,
} from './systems/aethericEvents'
import { itemHeatUnitsAt } from './systems/itemHeat'
import { LANTERN_ID } from './systems/lanternItem'
import { phaseCellsOf } from './systems/phaseCells'
import { phaseOf } from './systems/phaseSection'

// The phase lantern in play on the loaded slices (#261, the GD locks on #245 and #255 "phase",
// G&V's landing rules on #261): a slot tap sends the vehicle through the one cell ahead of its
// nose into the open cell beyond, over exactly the ticks the bit would need on that cell, for the
// bit's energy and the lantern's, leaving the cell as it was. In the corridor of
// `combatFixtures.ts` facing down: the cell under the nose is band-1 ground, and the cell under
// that is carved open first so the phase has a landing.

const LANTERN = AETHERIC_ECONOMY.phaseLantern
const PLAYER = 'p1'
const HALF_TILE_MM = MM_PER_METRE / 2
/** A carve that opens one cell: inside it, its rim softening never takes a neighbour past half. */
const LANDING_CARVE_RADIUS_MM = 600
/** Columns a planet-7 scan walks from the surface to the centre for a gated or a dense cell. */
const SCANNED_COLUMNS = 40

/** A session that keeps every command it sent, so a replay can send them again. */
interface RecordedSession {
  session: ScriptedSession
  commands: AuthorityCommand[]
  submit(tick: number, intent: CommandIntent): void
}

function recordedSession(): RecordedSession {
  const session = createScriptedSession()
  const commands: AuthorityCommand[] = []
  const submit = (tick: number, intent: CommandIntent) => {
    commands.push({ playerId: PLAYER, tick, seq: commands.length + 1, ...intent })
    session.submit(tick, intent)
  }
  return { session, commands, submit }
}

const carveCell = (tile: TilePoint): CommandIntent => ({
  type: 'debug.carveCircle',
  payload: {
    x: tile.tx * MM_PER_METRE + HALF_TILE_MM,
    y: tile.ty * MM_PER_METRE + HALF_TILE_MM,
    radius: LANDING_CARVE_RADIUS_MM,
    amount: SOLID_DENSITY,
  },
})

const setEnergy = (energy: string): CommandIntent => ({
  type: 'debug.setEnergy',
  payload: { energy },
})

interface PhaseFight extends RecordedSession {
  pressTick: number
  actTick: number
  cell: TilePoint
  landing: TilePoint
  /** The ticks the bit would need on the cell: what the phase must take. */
  bitTicks: number
}

interface PhaseOptions {
  /** Whether the landing cell is carved open before the press. */
  hasLanding?: boolean
  energy?: string
  /** Ticks to step after the press; the whole move and one more when left out. */
  ticks?: number
}

/**
 * The corridor facing down, the lantern in `powerup.1`, the landing cell carved, a tap on the
 * next tick, then the clock stepped tick by tick.
 */
function phaseFight({ hasLanding = true, energy = '', ticks }: PhaseOptions = {}): PhaseFight {
  const recorded = recordedSession()
  const commands = corridorCommands(FACING.down)
  commands.forEach(({ tick, intent }) => recorded.submit(tick, intent))
  const start = commands[commands.length - 1].tick
  const { cell, landing } = phaseCellsOf(recorded.session.vehicle().pose!)
  recorded.submit(start, setVehicleLoadoutCommand({ 'powerup.1': LANTERN_ID }))
  if (hasLanding) recorded.submit(start, carveCell(landing))
  if (energy !== '') recorded.submit(start, setEnergy(energy))
  const bitTicks = bitTicksOf(recorded.session.state(), cell)
  const pressTick = start + 1
  recorded.submit(pressTick, intentToUseSlot('powerup.1'))
  const actTick = pressTick + LANTERN.windupTicks
  stepTicks(recorded.session, pressTick, ticks ?? LANTERN.windupTicks + bitTicks + 1)
  return { ...recorded, pressTick, actTick, cell, landing, bitTicks }
}

function stepTicks(session: ScriptedSession, from: number, ticks: number): void {
  for (let at = 1; at <= ticks; at++) session.advanceTo(from + at)
}

function bitTicksOf(state: AuthorityState, cell: TilePoint): number {
  const params = planetParamsOf(state.planet)!
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, PLAYER))
  return ticksPerCell(drill, params, cell, materialCellAt(state.world, params, cell))!
}

function eventsOfType(session: ScriptedSession, type: string) {
  return session.events().filter((event) => event.type === type)
}

function refusalsOf(session: ScriptedSession) {
  return eventsOfType(session, 'power-up-core.PowerUpRefused').map((event) =>
    'reason' in event ? event.reason : null,
  )
}

/** The first tile that `picks`, walking the first columns down from the surface to the centre. */
function firstTileDown(params: PlanetParams, picks: (tile: TilePoint) => boolean): TilePoint {
  for (let tx = 0; tx < SCANNED_COLUMNS; tx++) {
    const surface = surfaceRowOfColumn(tx, params.radiusTiles)
    for (let ty = surface - 1; ty > surface - params.radiusTiles; ty--) {
      if (picks({ tx, ty })) return { tx, ty }
    }
  }
  throw new Error(`no such tile in the first ${SCANNED_COLUMNS} columns`)
}

/** A fresh session's vehicle over `cell`, facing down, the lantern slotted, tapped on tick 2. */
function tapOver(
  session: ScriptedSession,
  cell: TilePoint,
  energy = '',
): { session: ScriptedSession } {
  session.submit(1, poseAt({ tx: cell.tx, ty: cell.ty + 1 }, { facing: FACING.down }))
  session.submit(1, setVehicleLoadoutCommand({ 'powerup.1': LANTERN_ID }))
  if (energy !== '') session.submit(1, setEnergy(energy))
  session.submit(2, intentToUseSlot('powerup.1'))
  session.advanceTo(2 + LANTERN.windupTicks + 1)
  return { session }
}

/** A session on planet 7 and the first cell down column 20 that `picks` on it. */
function onPlanetSeven(
  picks: (state: AuthorityState, params: PlanetParams, tile: TilePoint) => boolean,
) {
  const session = createScriptedSession()
  session.submit(0, setPlanet(7))
  const state = session.state()
  const params = planetParamsOf(state.planet)!
  const cell = firstTileDown(params, (tile) => picks(state, params, tile))
  return { session, cell }
}

function isSolidGround(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  return kindOfCell(materialCellAt(state.world, params, tile)) === CELL_KIND.ground
}

function isGatedCell(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  const gated = gateOfTile({ state, playerId: PLAYER, params, blast: null, tool: LANTERN_ID }, tile)
  return gated !== null && gated.verdict.outcome !== 'cut'
}

function isDenseGround(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  if (!isSolidGround(state, params, tile) || isGatedCell(state, params, tile)) return false
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, PLAYER))
  return ticksPerCell(drill, params, tile, materialCellAt(state.world, params, tile)) === null
}

const REFUSED_CELLS = [
  {
    name: 'gated',
    reason: CELL_GATED,
    fight: () => {
      const { session, cell } = onPlanetSeven(isGatedCell)
      return tapOver(session, cell)
    },
  },
  {
    name: 'dense',
    reason: CELL_DENSE,
    fight: () => {
      const { session, cell } = onPlanetSeven(isDenseGround)
      return tapOver(session, cell)
    },
  },
  {
    name: 'locked',
    reason: CELL_LOCKED,
    fight: () => tapOver(createScriptedSession(), { tx: SITE.dockPoint.tx, ty: SITE.padRow }),
  },
  {
    name: 'core',
    reason: CORE_CELL,
    fight: () => tapOver(createScriptedSession(), coreTiles(1)[0]),
  },
]

function expectNothingSpent(session: ScriptedSession, energyBefore: number): void {
  expect(session.vehicle().energy).toBe(energyBefore)
  expect(chargesLeftOf(session.state(), PLAYER, LANTERN_ID)).toBe(LANTERN.charges)
  expect(itemHeatUnitsAt(session.state(), PLAYER, session.state().tick)).toBe(0)
  expect(eventsOfType(session, 'aetheric.PhaseStarted')).toEqual([])
  expect(phaseOf(session.state(), PLAYER).phase).toBeNull()
}

describe('phase lantern', () => {
  it('phasing leaves the cell intact and yields nothing', () => {
    const before = phaseFight({ ticks: 0 })
    const after = phaseFight()
    const params = planetParamsOf(after.session.state().planet)!
    expect(materialCellAt(after.session.state().world, params, after.cell)).toBe(
      materialCellAt(before.session.state().world, params, before.cell),
    )
    expect(isTileYielded(after.session.state().world, after.cell)).toBe(false)
    expect(after.session.vehicle().cargo).toEqual(before.session.vehicle().cargo)
    const sincePress = after.session.events().filter((event) => event.tick >= after.pressTick)
    expect(sincePress.map((event) => event.type)).not.toContain('TileDestroyed')
    expect(sincePress.map((event) => event.type)).not.toContain('CargoAdded')
    expect(sincePress.map((event) => event.type)).not.toContain('DrillDamageDealt')
  })

  it.each(REFUSED_CELLS)(
    'phasing is refused on a $name cell, spending nothing',
    ({ fight, reason }) => {
      const { session } = fight()
      expect(refusalsOf(session)).toEqual([reason])
      expectNothingSpent(session, session.vehicle().energy)
    },
  )

  it('phasing takes the ticks the bit would need, at 30 and 144 steps/s', () => {
    const fight = phaseFight()
    expect(fight.bitTicks).toBeGreaterThan(LANTERN.windupTicks)
    expect(eventsOfType(fight.session, 'aetheric.PhaseStarted')).toMatchObject([
      { tick: fight.actTick, ticks: fight.bitTicks },
    ])
    expect(eventsOfType(fight.session, 'aetheric.PhaseLanded')).toMatchObject([
      { tick: fight.actTick + fight.bitTicks, tx: fight.landing.tx, ty: fight.landing.ty },
    ])
    const endTick = fight.session.state().tick
    const at30 = replayRun(WORLD_SEED, fight.commands, { endTick, framesPerSecond: 30 })
    const at144 = replayRun(WORLD_SEED, fight.commands, { endTick, framesPerSecond: 144 })
    expect(at144.digests).toEqual(at30.digests)
    const landedTicks = (events: { type: string; tick: number }[]) =>
      events.filter((event) => event.type === 'aetheric.PhaseLanded').map((event) => event.tick)
    expect(landedTicks(at30.events)).toEqual([fight.actTick + fight.bitTicks])
    expect(landedTicks(at144.events)).toEqual([fight.actTick + fight.bitTicks])
  })

  it('phasing wakes no lava', () => {
    const before = phaseFight({ ticks: 0 })
    const after = phaseFight()
    expect(after.session.state().lava).toEqual(before.session.state().lava)
    expect(eventsOfType(after.session, 'LavaTouched')).toEqual([])
  })

  it('costs the bit’s energy for the cell’s ticks plus its own, a charge, and heats the gauge', () => {
    const before = phaseFight({ ticks: 0 })
    const after = phaseFight()
    expect(before.session.vehicle().energy - after.session.vehicle().energy).toBe(
      after.bitTicks * ENERGY_QUANTA_PER_TICK.drill + LANTERN.energyQuanta,
    )
    expect(itemHeatUnitsAt(after.session.state(), PLAYER, after.actTick)).toBe(LANTERN.heatUnits)
    expect(chargesLeftOf(after.session.state(), PLAYER, LANTERN_ID)).toBe(LANTERN.charges - 1)
    expect(after.session.state().players.p1.wallet).toEqual(
      before.session.state().players.p1.wallet,
    )
  })

  it('phasing into a solid landing cell is refused and spends nothing', () => {
    const fight = phaseFight({ hasLanding: false, ticks: LANTERN.windupTicks + 1 })
    expect(refusalsOf(fight.session)).toEqual([NO_LANDING])
    expectNothingSpent(fight.session, fight.session.vehicle().energy)
  })

  it('is refused energy_short on a tank that cannot pay the bit’s ticks, spending nothing', () => {
    const fight = phaseFight({ energy: '0', ticks: LANTERN.windupTicks + 1 })
    expect(refusalsOf(fight.session)).toEqual([ENERGY_SHORT])
    expect(fight.session.vehicle().energy).toBe(0)
    expect(chargesLeftOf(fight.session.state(), PLAYER, LANTERN_ID)).toBe(LANTERN.charges)
  })

  it('phasing ends centred in the landing cell with zero velocity: steered there, held against gravity, until it lands', () => {
    // The authority's half: the kernel motion seam steers the body to the landing cell's centre
    // (a reel arrives exactly on the step that reaches it) with gravity paused, for the whole
    // move and not a tick longer; the body's own pass through the cell is the physics layer's.
    const fight = phaseFight({ ticks: LANTERN.windupTicks })
    const held = {
      reelTo: { x: fight.landing.tx + 0.5, y: fight.landing.ty + 0.5 },
      isHovering: true,
    }
    for (let tick = fight.actTick; tick < fight.actTick + fight.bitTicks; tick++) {
      expect(vehicleMotionAt(fight.session.state(), PLAYER, tick), `tick ${tick}`).toMatchObject(
        held,
      )
    }
    expect(
      vehicleMotionAt(fight.session.state(), PLAYER, fight.actTick + fight.bitTicks),
    ).toMatchObject({
      reelTo: null,
      isHovering: false,
    })
    expect(powerUpOfItem(LANTERN_ID)?.holdOf?.(fight.session.state(), PLAYER)).toEqual({
      startTick: fight.actTick,
      finishTick: fight.actTick + fight.bitTicks,
    })
    stepTicks(fight.session, fight.session.state().tick, fight.bitTicks)
    expect(phaseOf(fight.session.state(), PLAYER)).toEqual({ phase: null })
    expect(fight.session.state().players.p1.slices ?? {}).not.toHaveProperty('aetheric.phase')
    expect(eventsOfType(fight.session, 'aetheric.PhaseLanded')).toMatchObject([
      { tx: fight.landing.tx, ty: fight.landing.ty },
    ])
  })

  it('a landing cell blocked mid-phase returns the rig to its start cell', () => {
    const spent = 4
    const fight = phaseFight({ ticks: LANTERN.windupTicks + spent })
    expect(fight.bitTicks).toBeGreaterThan(spent + 1)
    const energyMidPhase = fight.session.vehicle().energy
    fight.submit(fight.actTick + spent, freezeEnemies(true))
    fight.submit(
      fight.actTick + spent,
      spawnEnemy('crawler', 1, 0, fight.landing.ty - fight.cell.ty - 1),
    )
    const enemy = fight.session.state().combat.enemies[0]
    expect(tileOfMillimetres(enemy.x, enemy.y)).toEqual(fight.landing)
    const start = { tx: fight.cell.tx, ty: fight.cell.ty + 1 }
    fight.session.advanceTo(fight.actTick + spent + 1)
    expect(eventsOfType(fight.session, 'aetheric.PhaseReversed')).toMatchObject([
      { tick: fight.actTick + spent + 1, tx: start.tx, ty: start.ty, ticks: spent + 1 },
    ])
    expect(vehicleMotionAt(fight.session.state(), PLAYER, fight.actTick + spent + 1)).toMatchObject(
      {
        reelTo: { x: start.tx + 0.5, y: start.ty + 0.5 },
        isHovering: true,
      },
    )
    stepTicks(fight.session, fight.session.state().tick, spent + 1)
    expect(eventsOfType(fight.session, 'aetheric.PhaseReturned')).toMatchObject([
      { tick: fight.actTick + 2 * spent + 2, tx: start.tx, ty: start.ty },
    ])
    expect(eventsOfType(fight.session, 'aetheric.PhaseLanded')).toEqual([])
    expect(phaseOf(fight.session.state(), PLAYER).phase).toBeNull()
    expect(fight.session.vehicle().energy).toBe(energyMidPhase)
  })

  it('logs one phase_started beside power_up_used on the act tick', () => {
    const fight = phaseFight({ ticks: LANTERN.windupTicks })
    expect(eventsOfType(fight.session, 'power-up-core.PowerUpUsed')).toMatchObject([
      { tick: fight.actTick, itemId: LANTERN_ID },
    ])
    expect(eventsOfType(fight.session, 'aetheric.PhaseStarted')).toEqual([
      {
        tick: fight.actTick,
        type: 'aetheric.PhaseStarted',
        playerId: PLAYER,
        itemId: LANTERN_ID,
        cellTx: fight.cell.tx,
        cellTy: fight.cell.ty,
        toTx: fight.landing.tx,
        toTy: fight.landing.ty,
        ticks: fight.bitTicks,
        energy: fight.bitTicks * ENERGY_QUANTA_PER_TICK.drill + LANTERN.energyQuanta,
        heat: LANTERN.heatUnits,
      },
    ])
  })

  it('chimes when it lands and clanks lightly when refused or reversed, as a slot hold does', () => {
    const landed = phaseFight()
    expect(slotHoldEndOf(eventsOfType(landed.session, 'aetheric.PhaseLanded')[0])).toBe('finished')
    const refused = phaseFight({ hasLanding: false, ticks: LANTERN.windupTicks + 1 })
    expect(slotHoldEndOf(eventsOfType(refused.session, 'power-up-core.PowerUpRefused')[0])).toBe(
      'cancelled',
    )
  })
})
