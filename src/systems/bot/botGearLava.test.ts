import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState } from '../authority/authorityState'
import type { DrillGearAsk } from '../economy/drillGearCaps'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { stepOfMajor } from '../economy/upgradeSteps'
import { onCurveLevel } from '../economy/vehicleStats'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { noRouteDeaths } from './botDeathReplay'
import type { BotPlanet } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { boreShaftDownTo } from './botShaft'
import { isBoreLavaRisk, isLavaRisk } from './botWorld'
import { newMineLayout, shaftTileAt } from './mineLayout'

// The bot's lava rule (#113) with drill gear (ticket 392): its scripted bore cuts the gear's cells
// too, so a side cutter's cell beside a pocket frees the lava as surely as the bit would. On
// planet 8 (seed 83921) lava fills columns -9 to -7 at rows 350 to 348 (`botHeat.test.ts`): a
// shaft down column -5 never touches it, but its side cells in column -6 border it.

const SHAFT_COLUMN = -5
const ABOVE_POCKET = 353
const BELOW_POCKET = 340
const BESIDE_POCKET = { tx: SHAFT_COLUMN, ty: 349 }
const ABOVE_BESIDE = { tx: SHAFT_COLUMN, ty: 350 }

const SIDE_CUTTERS: DrillGearAsk = { sideCells: 1, sideEnergyShareBp: 10_000 }

function gearSlice(ask: DrillGearAsk): SliceDefinition {
  return {
    id: 'gear-probe',
    register: (r) => r.drillGear({ id: 'gear-probe.gear', gearOf: () => ask }),
  }
}

/** The on-curve planet 8 bot, undocked, enemies frozen, its shaft's open bottom above the pocket. */
function diggerBesidePocket(): { session: BotSession; planet: BotPlanet } {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: 8 } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  for (const upgradeId of UPGRADE_IDS) {
    const level = stepOfMajor(onCurveLevel(upgradeId, 8))
    session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit({ type: 'debug.setCasingGrade', payload: { grade: 5 } })
  session.submit({ type: 'debug.freezeEnemies', payload: { frozen: true } })
  session.submit({ type: 'undock', payload: {} })
  const params = planetParamsFor(83921, 8)
  const layout = {
    ...newMineLayout(params, dockSiteOf(params)),
    shaftColumn: SHAFT_COLUMN,
    shaftBottomRow: ABOVE_POCKET,
  }
  return { session, planet: botPlanetAt(layout, shaftTileAt(layout, ABOVE_POCKET)) }
}

function botPlanetAt(layout: BotPlanet['layout'], position: BotPlanet['pilot']['position']) {
  return {
    layout,
    pilot: { position, facing: 0 },
    chargePolicy: 'never',
    hasMetBlastTile: false,
    shellChargeSize: 0,
    hasBeenDestroyedHere: false,
    routeDeaths: noRouteDeaths(),
    gateRouteBlocks: [],
  } satisfies BotPlanet
}

function boreRiskWith(slices: readonly SliceDefinition[]): boolean {
  return withRegistrations(slices, () => {
    const { session } = diggerBesidePocket()
    return isBoreLavaRisk(session.state(), 'p1', ABOVE_BESIDE, BESIDE_POCKET)
  })
}

describe('bot: drill gear beside lava (#113, ticket 392)', () => {
  it('stands the shaft clear of the pocket for the bare bit', () => {
    const { session } = diggerBesidePocket()
    expect(isLavaRisk(session.state(), BESIDE_POCKET)).toBe(false)
    expect(isLavaRisk(session.state(), { tx: SHAFT_COLUMN - 1, ty: 349 })).toBe(true)
  })

  it('counts a bore whose side cutter would open a cell beside the pocket as a lava risk', () => {
    expect(boreRiskWith([])).toBe(false)
    expect(boreRiskWith([gearSlice(SIDE_CUTTERS)])).toBe(true)
  })

  it('steps the shaft aside from the pocket its side cutters would free, and never frees it', () => {
    withRegistrations([gearSlice(SIDE_CUTTERS)], () => {
      const { session, planet } = diggerBesidePocket()
      expect(boreShaftDownTo(session, planet, BELOW_POCKET)).toBe(true)
      expect(planet.layout.shaftJogs.length).toBeGreaterThan(0)
      expect(session.state().lava.loose).toEqual([])
      expect(session.events().filter((event) => event.type === 'LavaTouched')).toEqual([])
    })
  })
})
