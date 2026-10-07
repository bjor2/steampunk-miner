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
import { paramsOfSession, tileKindAt } from '../../../systems/bot/botWorld'
import { newMineLayout } from '../../../systems/bot/mineLayout'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { FIXTURE_SEED, worldCellOfGate } from './gateFixtures'
import type { CellGateKind } from './gateTable'

// The pacing bot meets planet 7's gated cells (#142 acceptance 8 and 9, ticket 236): it blasts a
// dynamite-gated shell with a charge that frees it, wants that size when it carries none, and
// never bores a cell a gate leaves standing. The bot stands west of the cell, facing it, with an
// open way back west for the blast.

const PLANET = 7
/** Tiles carved open behind the bot: past size 1's reach of 2, and its own tile. */
const OPEN_BEHIND = 4

function botFacing(kind: CellGateKind, carried: number) {
  const session = createBotSession(
    createAuthorityState({ planetIndex: PLANET, planetSeed: FIXTURE_SEED, playerIds: ['p1'] }),
    'p1',
  )
  const cell = worldCellOfGate(paramsOfSession(session.state()), (gate) => gate.kind === kind)
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

  it('never blasts a shell under the comparison policy', () => {
    const { session, planet, target } = botFacing('dynamite', 1)
    planet.chargePolicy = 'never'
    expect(openTile(session, planet, target)).toBe('blocked')
    expect(typesOf(session)).not.toContain('ChargePlanted')
  })

  it('takes a cell a gate leaves standing as a wall, with no bore against it', () => {
    const { session, planet, target } = botFacing('rig', 0)
    expect(openTile(session, planet, target)).toBe('blocked')
    expect(typesOf(session)).not.toContain('DrillGated')
    expect(tileKindAt(session.state(), target)).toBe('ore')
  })
})
