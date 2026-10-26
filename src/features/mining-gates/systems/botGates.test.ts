import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { setChargesIntent } from '../../../systems/authority/charges/chargeFixtures'
import { dockSiteOfPlanet } from '../../../systems/authority/planetOfState'
import { FREEZE_ENEMIES } from '../../../systems/authority/scriptedSession'
import { blastShellOpen, restockSizeOf } from '../../../systems/bot/botCharges'
import { noRouteDeaths } from '../../../systems/bot/botDeathReplay'
import { openTile } from '../../../systems/bot/botDig'
import type { BotPlanet } from '../../../systems/bot/botPilot'
import { NO_TICKS, reportPoseIntent } from '../../../systems/bot/botPose'
import { createBotSession, type BotSession } from '../../../systems/bot/botSession'
import { openRouteTile } from '../../../systems/bot/gateRouteBlocks'
import { cellOfTile, paramsOfSession, tileKindAt } from '../../../systems/bot/botWorld'
import { newMineLayout } from '../../../systems/bot/mineLayout'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { onCurveSteps, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { toCanonical } from '../../../systems/money'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { BLAST_BIT_NODE_ID } from '../../dynamite'
import { minTipMajorOfCell } from './canMine'
import { FIXTURE_SEED, worldCellOfGate } from './gateFixtures'
import type { CellGate, CellGateKind } from './gateTable'

// The pacing bot meets planet 7's gated cells (#142 acceptance 8 and 9, ticket 236): it blasts a
// dynamite-gated shell with a charge that frees it, wants that size when it carries none (the
// first size of the type that breaks the rock's tier, D4 #863), and never bores a cell a gate
// leaves standing. The bot stands west of the cell, facing it, with an
// open way back west for the blast.

const PLANET = 7
/** Tiles carved open behind the bot: past size 1's reach of 2, and its own tile. */
const OPEN_BEHIND = 4

/** The first gate of `kind`, or of tier `tier` when it is blast-only rock. */
function isGateOf(kind: CellGateKind, tier: number): (gate: CellGate) => boolean {
  return (gate) => gate.kind === kind && (gate.kind !== 'dynamite' || gate.tier === tier)
}

function botFacing(kind: CellGateKind, carried: number, tier = 1) {
  const session = createBotSession(
    createAuthorityState({ planetIndex: PLANET, planetSeed: FIXTURE_SEED, playerIds: ['p1'] }),
    'p1',
  )
  const cell = worldCellOfGate(paramsOfSession(session.state()), isGateOf(kind, tier))
  const stand = westOf(cell.tile, 1)
  session.submit(FREEZE_ENEMIES)
  session.submit(setChargesIntent(carried))
  for (let back = 0; back <= OPEN_BEHIND; back++) carveTile(session, westOf(stand, back))
  session.submit(reportPoseIntent(stand, 1, NO_TICKS))
  return { session, planet: planetOf(session, stand), target: cell.tile }
}

function planetOf(session: BotSession, stand: TilePoint): BotPlanet {
  return {
    layout: newMineLayout(
      paramsOfSession(session.state()),
      dockSiteOfPlanet(session.state().planet)!,
    ),
    pilot: { position: stand, facing: 1 },
    chargePolicy: 'blast',
    hasMetBlastTile: false,
    shellChargeSize: 0,
    hasBeenDestroyedHere: false,
    routeDeaths: noRouteDeaths(),
    gateRouteBlocks: [],
  }
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

/** More than the blast bit costs on its node curve. */
const BLAST_BIT_BUDGET = '1e30'

/** Researches the blast bit (D5 #864), on planet 7's curve with a full tank and a tip that scratches `tile`. */
function grindWithBlastBit(session: BotSession, tile: TilePoint): void {
  const wallet = toCanonical(session.state().players.p1.wallet)
  session.submit({ type: 'debug.setMoney', payload: { amount: BLAST_BIT_BUDGET } })
  session.submit({ type: 'tech-tree.unlock_node', payload: { nodeId: BLAST_BIT_NODE_ID } })
  session.submit({ type: 'debug.setMoney', payload: { amount: wallet } })
  const steps = { ...onCurveSteps(PLANET), drill_tip: tipStepScratching(session, tile) }
  UPGRADE_IDS.forEach((upgradeId) =>
    session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level: steps[upgradeId] } }),
  )
  const energyMax = vehicleStatsAt(steps).energyMax
  session.submit({ type: 'debug.setEnergy', payload: { energy: String(energyMax) } })
}

/** The on-curve tip step, or the first one that scratches the tile when that is higher. */
function tipStepScratching(session: BotSession, tile: TilePoint): number {
  const params = paramsOfSession(session.state())
  const major = minTipMajorOfCell(params, tile, cellOfTile(session.state(), tile))
  return Math.max(onCurveSteps(PLANET).drill_tip, stepOfMajor(major))
}

function typesOf(session: BotSession): string[] {
  return session.events().map((event) => event.type)
}

describe('bot: dynamite-gated shells and gate walls', () => {
  it('blasts a shell open with a charge that frees it, logged as cleared by dynamite', () => {
    const { session, planet, target } = botFacing('dynamite', 1)
    expect(blastShellOpen(session, planet, target)).toBe(true)
    expect(tileKindAt(session.state(), target)).toBe('open')
    expect(session.events()).toContainEqual(
      expect.objectContaining({ type: 'mining-gates.GateCleared', ...target, method: 'dynamite' }),
    )
  })

  it('wants the size a shell needs when it carries none, and leaves the shell standing', () => {
    const { session, planet, target } = botFacing('dynamite', 0)
    expect(blastShellOpen(session, planet, target)).toBe(false)
    expect(tileKindAt(session.state(), target)).toBe('ore')
    expect(planet.hasMetBlastTile).toBe(true)
    expect(restockSizeOf(planet)).toBe(1)
  })

  it('wants the first type-2 size for tier-2 rock and leaves it standing to a type-1 charge', () => {
    const { session, planet, target } = botFacing('dynamite', 1, 2)
    expect(blastShellOpen(session, planet, target)).toBe(false)
    expect(tileKindAt(session.state(), target)).toBe('ore')
    expect(restockSizeOf(planet)).toBe(5)
  })

  it('never blasts a shell under the comparison policy', () => {
    const { session, planet, target } = botFacing('dynamite', 1)
    planet.chargePolicy = 'never'
    expect(openTile(session, planet, target)).toBe('blocked')
    expect(typesOf(session)).not.toContain('ChargePlanted')
  })

  it("bores a shell open in one bore timed at the blast bit's speed, logged as cleared by the drill", () => {
    const { session, planet, target } = botFacing('dynamite', 0)
    planet.chargePolicy = 'never'
    grindWithBlastBit(session, target)
    const before = session.events().length
    expect(openTile(session, planet, target)).toBe('opened')
    const bores = session
      .events()
      .slice(before)
      .filter((event) => event.type === 'DrillDamageDealt')
    expect(bores).toHaveLength(1)
    expect(session.events()).toContainEqual(
      expect.objectContaining({ type: 'mining-gates.GateCleared', ...target, method: 'drill' }),
    )
  })

  it('takes a cell a gate leaves standing as a wall, with no bore against it', () => {
    const { session, planet, target } = botFacing('rig', 0)
    expect(openTile(session, planet, target)).toBe('blocked')
    expect(typesOf(session)).not.toContain('DrillGated')
    expect(tileKindAt(session.state(), target)).toBe('ore')
  })
})

describe('bot: gate_blocked_no_route (GD ruling on ticket 237)', () => {
  it('notes an extractor wall on its way down once, with the extractor it needs', () => {
    const { session, planet, target } = botFacing('rig', 0)
    expect(openRouteTile(session, planet, target)).toBe('blocked')
    expect(openRouteTile(session, planet, target)).toBe('blocked')
    expect(planet.gateRouteBlocks).toEqual([
      expect.objectContaining({ planet: PLANET, ...target, gateKind: 'rig' }),
    ])
  })

  it('notes no stall for a shell that waits for a restock', () => {
    const { session, planet, target } = botFacing('dynamite', 0)
    expect(openRouteTile(session, planet, target)).toBe('blocked')
    expect(planet.gateRouteBlocks).toEqual([])
  })
})
