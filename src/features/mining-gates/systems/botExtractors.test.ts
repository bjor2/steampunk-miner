import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { dockSiteOfPlanet } from '../../../systems/authority/planetOfState'
import { FREEZE_ENEMIES } from '../../../systems/authority/scriptedSession'
import { noRouteDeaths } from '../../../systems/bot/botDeathReplay'
import { openTile } from '../../../systems/bot/botDig'
import type { BotPlanet } from '../../../systems/bot/botPilot'
import { NO_TICKS, reportPoseIntent } from '../../../systems/bot/botPose'
import { createBotSession, type BotSession } from '../../../systems/bot/botSession'
import { paramsOfSession, tileKindAt } from '../../../systems/bot/botWorld'
import { newMineLayout } from '../../../systems/bot/mineLayout'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { FIXTURE_SEED, worldCellOfGate } from './gateFixtures'

// The pacing bot with an extractor (#142 acceptance 10, ticket 237): a wall its own extractor
// opens by standing by it is touched and waited out, then bored or entered, and the cell is logged
// cleared by the extractor. Without one it stays a wall. The drill is on curve on each planet.

function botBeside(planetIndex: number, rigId: string, owned: string[]) {
  const session = createBotSession(
    createAuthorityState({ planetIndex, planetSeed: FIXTURE_SEED, playerIds: ['p1'] }),
    'p1',
  )
  const params = paramsOfSession(session.state())
  const cell = worldCellOfGate(params, (gate) => gate.kind === 'rig' && gate.rig.id === rigId)
  const stand = { tx: cell.tile.tx - 1, ty: cell.tile.ty }
  session.submit(FREEZE_ENEMIES)
  setDrillOnCurve(session, planetIndex)
  session.submit({ type: 'debug.setVehicleLoadout', payload: { slots: {}, owned } })
  session.submit(reportPoseIntent(stand, 1, NO_TICKS))
  return { session, planet: planetOf(session, stand), target: cell.tile }
}

function setDrillOnCurve(session: BotSession, planetIndex: number): void {
  const steps = onCurveSteps(planetIndex)
  for (const upgradeId of ['drill_power', 'drill_tip'] as const) {
    session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level: steps[upgradeId] } })
  }
}

function planetOf(session: BotSession, stand: TilePoint): BotPlanet {
  return {
    layout: newMineLayout(
      paramsOfSession(session.state()),
      dockSiteOfPlanet(session.state().planet)!,
    ),
    pilot: { position: stand, facing: 1 },
    chargePolicy: 'never',
    hasMetBlastTile: false,
    shellChargeSize: 0,
    hasBeenDestroyedHere: false,
    routeDeaths: noRouteDeaths(),
    gateRouteBlocks: [],
  }
}

function clearedByExtractor(session: BotSession, tile: TilePoint) {
  return session
    .events()
    .filter(
      (event) =>
        event.type === 'mining-gates.GateCleared' &&
        event.tx === tile.tx &&
        event.ty === tile.ty &&
        event.method === 'rig',
    )
}

describe('bot: extractor walls', () => {
  it.each([
    [7, 'rig.resonance'],
    [19, 'rig.acid_etcher'],
    [26, 'rig.induction'],
  ])('opens a planet %i cell with its own %s and logs it cleared by the extractor', (p, rigId) => {
    const { session, planet, target } = botBeside(p, rigId, [rigId])
    expect(openTile(session, planet, target)).toBe('opened')
    expect(tileKindAt(session.state(), target)).toBe('open')
    expect(clearedByExtractor(session, target)).toHaveLength(1)
  })

  it('keeps a resonance cell a wall without the fork', () => {
    const { session, planet, target } = botBeside(7, 'rig.resonance', [])
    expect(openTile(session, planet, target)).toBe('blocked')
    expect(tileKindAt(session.state(), target)).toBe('ore')
  })
})
