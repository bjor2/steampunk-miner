import { describe, expect, it } from 'vitest'
import { fromCanonical, toCanonical } from '../money'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { FACING, type VehiclePose } from '../vehicle/vehiclePose'
import { setEnergyCommand, setHullCommand } from '../vehicle/vehicleCommands'
import {
  createScriptedSession,
  mineTile,
  PARAMS,
  poseInBay,
  SITE,
  surfaceOreTiles,
} from '../authority/scriptedSession'
import {
  CORRIDOR_MIDDLE,
  freezeEnemies,
  poseAt,
  prepareCorridor,
  spawnEnemy,
} from '../authority/combat/combatFixtures'
import { ACTION_MAP, defaultBindings } from '../input/actionMap'
import { coreEdgeDistance, localOctantOf } from './compass'
import { energyWarningLevel } from './energyWarning'
import { energyWarningMarkers, selectHudModel } from './hudModel'
import { vehicleModeMarkers } from './hudReadings'

const BINDINGS = defaultBindings(ACTION_MAP)
const canonical = (text: string) => toCanonical(fromCanonical(text))
const QUANTA = 240
const LEVEL_0 = { energyMaxQuanta: 150 * QUANTA, speedMax: 6 }

function hudOf(session: ReturnType<typeof createScriptedSession>, depthTiles = 0) {
  return selectHudModel({ state: session.state(), playerId: 'p1', depthTiles, bindings: BINDINGS })
}

const UPRIGHT: VehiclePose = { x: 0, y: 0, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.right }

describe('HUD model', () => {
  it('shows energy and hull as the state holds them, with the exact value beside the text', () => {
    const session = createScriptedSession()
    session.submit(0, setEnergyCommand('112'))
    session.submit(0, setHullCommand('61.5'))
    const hud = hudOf(session)
    expect(hud.energy).toMatchObject({ text: '112 / 150', exact: canonical('112') })
    expect(hud.hull).toMatchObject({ text: '62 / 100', exact: canonical('61.5') })
  })

  it('counts cargo units and marks a full hold', () => {
    const session = createScriptedSession()
    const tiles = surfaceOreTiles(10)
    tiles.forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
    const hud = hudOf(session)
    expect(hud.cargo).toMatchObject({ text: '10 / 10', isFull: true, coreText: '' })
  })

  it('values the cargo at the shop price of every held unit', () => {
    const session = createScriptedSession()
    surfaceOreTiles(3).forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
    const hud = hudOf(session)
    expect(hud.cargo.text).toBe('3 / 10')
    expect(hud.cargoValue.exact).not.toBe(canonical('0'))
  })

  it('reads the depth the client reports and the band at that depth', () => {
    const session = createScriptedSession()
    expect(hudOf(session, 0).depth).toMatchObject({ text: '0', band: 1 })
    expect(hudOf(session, 100).depth).toMatchObject({ text: '100', depthTiles: 100 })
    expect(hudOf(session, 100).depth.band).toBeGreaterThan(1)
  })

  it('reads ALT above the surface', () => {
    const session = createScriptedSession()
    const above = { tx: 3, ty: SITE.padRow + 5 }
    session.submit(1, poseAt(above, { facing: FACING.right }))
    expect(hudOf(session).depth.text).toBe('ALT 4')
  })

  it('prompts to dock exactly when the authority would accept a dock, naming the bound key', () => {
    const session = createScriptedSession()
    expect(hudOf(session).dockPrompt).toEqual({ isShown: true, text: 'E: Dock at the Sell bay' })
    session.submit(1, poseAt({ tx: 20, ty: SITE.padRow + 3 }, { facing: FACING.right }))
    expect(hudOf(session).dockPrompt.isShown).toBe(false)
  })

  it('names the Upgrade bay in the prompt on its pad, and prompts nothing on the hub between', () => {
    const session = createScriptedSession()
    session.submit(1, poseInBay('upgrade'))
    expect(hudOf(session).dockPrompt.text).toBe('E: Dock at the Upgrade bay')
    session.submit(2, poseAt({ tx: 0, ty: SITE.padRow + 1 }, { facing: FACING.right }))
    expect(hudOf(session).dockPrompt.isShown).toBe(false)
  })

  it('marks a debug run once a debug command was accepted', () => {
    const session = createScriptedSession()
    expect(hudOf(session).isDebugRun).toBe(false)
    session.submit(0, setEnergyCommand('100'))
    expect(hudOf(session).isDebugRun).toBe(true)
  })

  it('gives every vehicle state and warning level a text and an icon, never colour alone', () => {
    for (const marker of Object.values(vehicleModeMarkers())) {
      expect(marker.text).not.toBe('')
      expect(marker.icon).not.toBe('')
    }
    expect(energyWarningMarkers().low.text).not.toBe('')
    expect(energyWarningMarkers().critical.icon).not.toBe('none')
  })
})

describe('low-energy warning', () => {
  const levelAt = (units: number, depthTiles: number) =>
    energyWarningLevel({ ...LEVEL_0, energyQuanta: units * QUANTA, depthTiles })

  it('needs 25 units to climb home from depth 100 at level 0, and warns at twice that', () => {
    expect(levelAt(51, 100)).toBe('ok')
    expect(levelAt(50, 100)).toBe('low')
    expect(levelAt(26, 100)).toBe('low')
    expect(levelAt(25, 100)).toBe('critical')
  })

  it('never warns later than the 25% and 10% lines at the surface', () => {
    expect(energyWarningLevel({ ...LEVEL_0, energyQuanta: 37.5 * QUANTA + 1, depthTiles: 0 })).toBe(
      'ok',
    )
    expect(energyWarningLevel({ ...LEVEL_0, energyQuanta: 37.5 * QUANTA, depthTiles: 0 })).toBe(
      'low',
    )
    expect(levelAt(16, 0)).toBe('low')
    expect(levelAt(15, 0)).toBe('critical')
  })

  it('first leaves ok with at least the return reserve left, in a tick-by-tick dive and climb', () => {
    const drillTicksPerTile = 30
    const climbTicksPerTile = 10
    let energy = 150 * QUANTA
    let depth = 0
    const ticks: { energy: number; depth: number }[] = []
    for (let tick = 0; energy > 0; tick++) {
      const isDiving = depth < 220 && ticks.every((sample) => sample.depth <= depth)
      energy -= isDiving ? ENERGY_QUANTA_PER_TICK.drill : ENERGY_QUANTA_PER_TICK.thrust
      if (isDiving && tick % drillTicksPerTile === 0) depth++
      if (!isDiving && tick % climbTicksPerTile === 0) depth = Math.max(0, depth - 1)
      ticks.push({ energy: Math.max(0, energy), depth })
    }
    const first = ticks.find(
      (sample) =>
        energyWarningLevel({
          ...LEVEL_0,
          energyQuanta: sample.energy,
          depthTiles: sample.depth,
        }) !== 'ok',
    )
    expect(first).toBeDefined()
    const reserveQuanta = Math.ceil((first!.depth * 1.5) / 6) * QUANTA
    expect(first!.energy).toBeGreaterThanOrEqual(reserveQuanta)
  })
})

describe('HUD compass', () => {
  it('points in the vehicle frame as octants, diagonal when 5*min >= 2*max', () => {
    expect(localOctantOf(UPRIGHT, 0, 5000)).toBe(0)
    expect(localOctantOf(UPRIGHT, 5000, 5000)).toBe(1)
    expect(localOctantOf(UPRIGHT, 5000, 1000)).toBe(2)
    expect(localOctantOf(UPRIGHT, 5000, 2000)).toBe(1)
    expect(localOctantOf(UPRIGHT, 0, -5000)).toBe(4)
    expect(localOctantOf(UPRIGHT, -5000, 0)).toBe(6)
  })

  it('gives the same octant on the far side of the planet in the vehicle frame', () => {
    const upsideDown = { ...UPRIGHT, upy: -1024 }
    expect(localOctantOf(upsideDown, 0, -5000)).toBe(0)
    expect(localOctantOf(upsideDown, -5000, 0)).toBe(2)
  })

  it('counts the core distance from the core edge, never below 0', () => {
    expect(coreEdgeDistance({ x: 0, y: 150_900 }, 100)).toBe(50)
    expect(coreEdgeDistance({ x: 0, y: 50_000 }, 100)).toBe(0)
  })

  it('gives fixed integers for a known pose, with no camera input at all', () => {
    const session = createScriptedSession()
    session.submit(1, poseAt({ tx: 20, ty: SITE.padRow + 1 }, { facing: FACING.right }))
    const { dockArrow, coreDistance } = hudOf(session)
    expect(dockArrow).toEqual({ octant: 6, distance: 20 })
    const radius = Math.floor(Math.hypot(20_500, (SITE.padRow + 1) * 1000 + 500) / 1000)
    expect(coreDistance).toBe(radius - PARAMS.coreRadiusTiles)
    expect(selectHudModel.length).toBe(1)
  })
})

describe('HUD telegraphs', () => {
  function windingUp() {
    const session = createScriptedSession()
    let tick = prepareCorridor(session)
    session.submit(tick, spawnEnemy('crawler', 1, 3))
    while (session.state().combat.enemies[0]?.phase !== 'windup') {
      tick++
      session.advanceTo(tick)
      if (tick % 12 === 0) session.submit(tick, poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
    }
    session.submit(tick, freezeEnemies(true))
    return session
  }

  it('lists a winding-up enemy with its octant, arc and the full wind-up left', () => {
    const [marker] = hudOf(windingUp()).threats
    expect(marker).toMatchObject({ kind: 'crawler', octant: 2, arc: 'F', isTremor: false })
    expect(marker.ticksLeft).toBeGreaterThanOrEqual(24)
  })

  it('leaves idle enemies off the HUD', () => {
    const session = createScriptedSession()
    const tick = prepareCorridor(session)
    session.submit(tick, freezeEnemies(true))
    session.submit(tick, spawnEnemy('crawler', 1, 5))
    expect(hudOf(session).threats).toEqual([])
  })
})
