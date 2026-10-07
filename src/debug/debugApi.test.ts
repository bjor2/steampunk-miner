import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { deriveSummary } from '../logging/runSummary'
import {
  readEnemies,
  readLocalVehicle,
  readPlanetWorld,
  resetGameStore,
  takeSessionSnapshot,
  useGameStore,
} from '../store/gameStore'
import { placeholderSidecarOf } from '../systems/art/artCatalogue'
import { cellDensitySum } from '../systems/world/cellYield'
import type { PlanetParams } from '../systems/world/planetParams'
import { fromCanonical } from '../systems/money'
import { parseScenario, type Scenario } from '../systems/scenario'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { createDebugApi, DebugCommandNotImplementedError } from './debugApi'
import { SHIPPED_ART } from '../scene/shippedArt'

const readScenarioFile = (name: string) =>
  readFileSync(new URL(`../../scenarios/${name}`, import.meta.url), 'utf8')

let sink: MemorySink

/** A fresh run: new authority, new log. */
function startRun(): void {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
}

beforeEach(startRun)
afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

describe('debug api: set state', () => {
  it('drives the game through the design doc command names', () => {
    const debug = createDebugApi()
    expect(debug.setPlanet(300)).toEqual({ ok: true })
    debug.setPlanetSeed(83921)
    debug.giveMoney('1e100')
    debug.teleportToDepthTiles(40)
    expect(game()).toMatchObject({
      planetTier: 300,
      planetSeed: 83921,
      depthTiles: 40,
      money: fromCanonical('1e100'),
    })
  })

  it('answers a bad argument with its problems and changes nothing', () => {
    const debug = createDebugApi()
    expect(debug.giveMoney(5 as unknown as string)).toMatchObject({ ok: false })
    expect(debug.setPlanet(-1)).toEqual({
      ok: false,
      problems: ['planetTier must be a whole number >= 0, got -1'],
    })
    expect(sink.commands).toEqual([])
  })

  it('says plainly that a command is not built yet', () => {
    expect(() => createDebugApi().teleportToCore()).toThrow(DebugCommandNotImplementedError)
  })

  it('teleports to a depth in basis points of the radius, and refuses one past the centre', () => {
    const debug = createDebugApi()
    expect(debug.teleportToDepth(5000)).toEqual({ ok: true })
    expect(game().depthTiles).toBe(150)
    expect(debug.teleportToDepth(10001)).toEqual({
      ok: false,
      problems: ['depthBp must be a whole number from 0 to 10000, got 10001'],
    })
    expect(debug.teleportToDepth(0.82 as number)).toMatchObject({ ok: false })
  })

  it('teleports the vehicle home and docks it as a logged debug command, once', () => {
    const debug = createDebugApi()
    expect(debug.teleportToDock()).toEqual({ ok: true })
    expect(game().vehicle.mode).toBe('docked')
    expect(sink.events.map((event) => event.data)).toContainEqual(
      expect.objectContaining({ command: 'debug.teleportToDock' }),
    )
    expect(debug.teleportToDock()).toEqual({
      ok: false,
      problems: ['the vehicle is already docked'],
    })
  })
})

describe('debug api: core', () => {
  it('fills the core bay as a logged debug command, completing the planet-1 core at 63', () => {
    expect(createDebugApi().setCoreFragments(63)).toEqual({ ok: true })
    expect(game().platform).toMatchObject({ coreBay: 63, visualState: 'core_drive' })
    expect(game().isCoreCompleted).toBe(true)
    expect(sink.events.map((event) => event.event)).toEqual([
      'platform_configuration_changed',
      'core_completed',
      'debug_command_applied',
    ])
  })

  it('refuses a fractional count and changes nothing', () => {
    expect(createDebugApi().setCoreFragments(1.5)).toMatchObject({ ok: false })
    expect(sink.commands).toEqual([])
    expect(game().platform.coreBay).toBe(0)
  })
})

describe('debug api: ground (#36)', () => {
  const DIG = { x: 20_500, y: 290_500, radius: 1500 }
  const densitySum = () => {
    const { world, params } = readPlanetWorld()
    return cellDensitySum(world, params as PlanetParams, { tx: 20, ty: 290 })
  }

  it('carves a circle as a logged debug command, crediting no ore', () => {
    expect(createDebugApi().carveCircle(DIG.x, DIG.y, DIG.radius)).toEqual({ ok: true })
    expect(densitySum()).toBe(0)
    expect(game().debugApplied).toBe(true)
    expect(sink.events.map((event) => event.event)).toEqual(['debug_command_applied'])
    expect(readLocalVehicle().cargo).toEqual({ ore: {}, coreFragments: 0 })
  })

  it('fills a carved circle back to solid ground', () => {
    const debug = createDebugApi()
    debug.carveCircle(DIG.x, DIG.y, DIG.radius)
    expect(debug.fillCircle(DIG.x, DIG.y, DIG.radius)).toEqual({ ok: true })
    expect(densitySum()).toBe(16 * 255)
  })

  it('refuses a circle of radius 0 or an amount past 255 and changes nothing', () => {
    const debug = createDebugApi()
    expect(debug.carveCircle(DIG.x, DIG.y, 0)).toMatchObject({ ok: false })
    expect(debug.fillCircle(DIG.x, DIG.y, DIG.radius, 256)).toMatchObject({ ok: false })
    expect(sink.commands).toEqual([])
    expect(densitySum()).toBe(16 * 255)
  })
})

describe('debug api: time', () => {
  it('fast-forwards the authority and reports where it stands', () => {
    const result = createDebugApi().fastForward(7200)
    expect(result).toMatchObject({ ok: true, tick: 7200 })
  })

  it('submits scripted commands at their ticks during a fast-forward', () => {
    createDebugApi().fastForward(600, [
      { tick: 300, type: 'debug.grantMoney', payload: { amount: '5' } },
    ])
    expect(sink.commands).toMatchObject([{ tick: 300, type: 'debug.grantMoney' }])
    expect(game().money).toEqual(fromCanonical('5'))
  })

  it('refuses a scripted command outside the window', () => {
    const result = createDebugApi().fastForward(60, [
      { tick: 61, type: 'debug.grantMoney', payload: { amount: '5' } },
    ])
    expect(result).toEqual({
      ok: false,
      problems: ['commands[0].tick must be from 0 to 60, got 61'],
    })
  })
})

describe('debug api: snapshot and restore', () => {
  it('restores a snapshot to the same digest, and play continues from it', () => {
    const debug = createDebugApi()
    debug.giveMoney('1e30')
    const taken = debug.snapshot()
    if (!taken.ok) throw new Error('snapshot refused')
    debug.giveMoney('1')
    expect(debug.restore(JSON.parse(JSON.stringify(taken.snapshot)))).toEqual({
      ok: true,
      tick: taken.snapshot.tick,
      digest: taken.snapshot.digest,
    })
    expect(game().money).toEqual(fromCanonical('1e30'))
    expect(debug.giveMoney('2')).toEqual({ ok: true })
    expect(game().money).toEqual(fromCanonical('1.000000000000000000000000000002e30'))
  })

  it('refuses a snapshot from another generator version', () => {
    const debug = createDebugApi()
    const taken = debug.snapshot()
    if (!taken.ok) throw new Error('snapshot refused')
    expect(debug.restore({ ...taken.snapshot, generatorVersion: 99 })).toEqual({
      ok: false,
      problems: ['snapshot.generatorVersion is 99, this build reads 7'],
    })
  })
})

describe('debug api: scenarios', () => {
  const planet1Text = readScenarioFile('planet1-start.scenario.json')

  function playPlanet1Scenario() {
    startRun()
    const result = createDebugApi().applyScenario(JSON.parse(planet1Text))
    return { result, events: [...sink.events] }
  }

  it('logs the exact sequence of core events of the committed planet 1 scenario', () => {
    const { events } = playPlanet1Scenario()
    expect(events.map(({ event, tick, cmd, data }) => ({ event, tick, cmd, data }))).toEqual([
      {
        event: 'debug_command_applied',
        tick: 0,
        cmd: [0, 1],
        data: { command: 'debug.setPlanet', args: { planetIndex: 1 } },
      },
      {
        event: 'debug_command_applied',
        tick: 0,
        cmd: [0, 2],
        data: { command: 'debug.setPlanetSeed', args: { planetSeed: 83921 } },
      },
      {
        event: 'debug_command_applied',
        tick: 0,
        cmd: [0, 3],
        data: { command: 'debug.setMoney', args: { amount: '0e+0' } },
      },
      {
        event: 'debug_command_applied',
        tick: 0,
        cmd: undefined,
        data: { command: 'fastForward', args: { ticks: 7200, commands: 0 } },
      },
      {
        event: 'state_digest',
        tick: 3600,
        cmd: undefined,
        data: { digest: expect.stringMatching(/^[0-9a-f]{16}$/), scope: 'periodic' },
      },
      {
        event: 'state_digest',
        tick: 7200,
        cmd: undefined,
        data: { digest: expect.stringMatching(/^[0-9a-f]{16}$/), scope: 'periodic' },
      },
    ])
  })

  it('emits only events that validate against the schema registry', () => {
    expect(playPlanet1Scenario().events.flatMap(runEventProblems)).toEqual([])
  })

  it('summarises two runs of the same scenario identically', () => {
    const first = deriveSummary(playPlanet1Scenario().events)
    const second = deriveSummary(playPlanet1Scenario().events)
    expect(second).toEqual(first)
    expect(first).toMatchObject({ durationTicks: 7200, debugCommandsApplied: 4 })
  })

  it('reaches the same digest through the debug API as through ?scenario=', () => {
    const viaDebugApi = playPlanet1Scenario().result
    startRun()
    // The ?scenario= path of bootstrap.ts: parse the text, then apply through the store.
    const { scenario, problems } = parseScenario(planet1Text)
    expect(problems).toEqual([])
    game().applyScenario(scenario as Scenario)
    const viaLaunch = createDebugApi().snapshot()
    expect(viaLaunch.ok && viaDebugApi.ok).toBe(true)
    expect(viaDebugApi).toMatchObject({ digest: viaLaunch.ok ? viaLaunch.snapshot.digest : '' })
  })

  it('sets the upgrade levels a scenario starts with, as debug commands', () => {
    const scenario = { ...minimalScenarioFor('upgrades'), start: { upgrades: { drill_tip: 7 } } }
    expect(createDebugApi().applyScenario(scenario)).toMatchObject({ ok: true })
    expect(createDebugApi().vehicleStats()).toMatchObject({ levels: { drill_tip: 7 } })
    expect(sink.events.map((event) => event.event)).toContain('debug_command_applied')
  })

  it('spawns the enemies a scenario starts with, as debug commands', () => {
    const scenario = {
      ...minimalScenarioFor('enemies'),
      worldSeed: 83921,
      // A burrower in the rock under the pad: the dock point stands in open sky.
      start: { enemies: [{ kind: 'burrower', tier: 2, dx: 2, dy: -3 }] },
    }
    expect(createDebugApi().applyScenario(scenario)).toMatchObject({ ok: true })
    expect(readEnemies().map((enemy) => [enemy.kind, enemy.tier])).toEqual([['burrower', 2]])
    expect(sink.events.map((event) => event.data)).toContainEqual(
      expect.objectContaining({ command: 'debug.spawnEnemy' }),
    )
  })

  it('refuses the broken scenario with every problem and applies none of it', () => {
    const before = createDebugApi().snapshot()
    const result = createDebugApi().applyScenario(
      JSON.parse(readScenarioFile('broken.scenario.json')),
    )
    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? [] : result.problems).toHaveLength(5)
    expect(createDebugApi().snapshot()).toEqual(before)
    expect(sink.events).toEqual([])
    expect(sink.commands).toEqual([])
  })
})

describe('debug api: vehicle', () => {
  const vehicleStatsOf = (debug: ReturnType<typeof createDebugApi>) => {
    const report = debug.vehicleStats()
    if (!report.ok) throw new Error(report.problems.join('; '))
    return report
  }

  it('reads the vehicle stats and the on-curve table for planets 1 to 40 without logging', () => {
    const debug = createDebugApi()
    const report = vehicleStatsOf(debug)
    expect(report.stats).toMatchObject({ drillPower: '1.5e+0', energyMax: 150, cargoCapacity: 10 })
    expect(report.onCurveByPlanet.map((row) => row.planetIndex)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    )
    expect(report.onCurveByPlanet[0].levels).toMatchObject({ drill_power: 13, drill_tip: 7 })
    expect(sink.events).toEqual([])
    expect(sink.commands).toEqual([])
  })

  it('reports every placeholder part id of each tier on the run vehicle, without logging', () => {
    const partIdsOfTier = (tier: number) =>
      (placeholderSidecarOf(SHIPPED_ART, 'vehicle')?.parts ?? [])
        .filter((part) => part.tier === tier)
        .map((part) => part.id)
    const debug = createDebugApi()
    expect(debug.vehicleParts()).toMatchObject({ ok: true, visualTier: 1 })
    expect(debug.vehicleParts()).toMatchObject({
      partIds: expect.arrayContaining(partIdsOfTier(1)),
    })
    expect(sink.events).toEqual([])
    debug.setUpgrade('drill_tip', 1500)
    expect(debug.vehicleParts()).toMatchObject({
      visualTier: 3,
      partIds: expect.arrayContaining(partIdsOfTier(3)),
    })
    expect(sink.events.map((event) => event.event)).toEqual([
      'vehicle_configuration_changed',
      'debug_command_applied',
    ])
  })

  it('adds the guns turret to the vehicle parts once mounted, its barrel look by major (#107)', () => {
    const debug = createDebugApi()
    expect(debug.vehicleParts()).toMatchObject({ gunLevel: 0 })
    expect(debug.vehicleParts()).not.toMatchObject({
      partIds: expect.arrayContaining(['t1-turret-mount']),
    })
    expect(debug.setGunLevel(10)).toEqual({ ok: true })
    expect(debug.vehicleParts()).toMatchObject({
      gunLevel: 10,
      partIds: expect.arrayContaining(['t1-turret-mount', 't1-turret-head', 't1-gun-barrel']),
    })
    debug.setGunLevel(120)
    expect(debug.vehicleParts()).toMatchObject({
      partIds: expect.arrayContaining(['t3-gun-barrel']),
    })
    expect(sink.events.map((event) => event.event)).toEqual([
      'debug_command_applied',
      'debug_command_applied',
    ])
  })

  it('bolts a charge rack on with its charges as a logged debug command (#109)', () => {
    const debug = createDebugApi()
    expect(debug.vehicleParts()).toMatchObject({ rackCharges: null })
    expect(debug.setCharges(2, 1)).toEqual({ ok: true })
    expect(debug.vehicleParts()).toMatchObject({
      rackCharges: 2,
      partIds: expect.arrayContaining(['charge-rack', 'charge-1', 'charge-2']),
    })
    expect(debug.vehicleParts()).not.toMatchObject({
      partIds: expect.arrayContaining(['charge-3']),
    })
    expect(sink.events.map((event) => event.event)).toEqual(['debug_command_applied'])
  })

  it('refuses a rack holding more charges than its slots, applying nothing', () => {
    const debug = createDebugApi()
    expect(debug.setCharges(5, 1)).toMatchObject({ ok: false })
    expect(debug.vehicleParts()).toMatchObject({ rackCharges: null })
  })

  it('refuses a gun step above the top of the gun track, applying nothing', () => {
    const debug = createDebugApi()
    expect(debug.setGunLevel(161)).toMatchObject({ ok: false })
    expect(debug.vehicleParts()).toMatchObject({ gunLevel: 0 })
  })

  it('sets the lining type and, on a heat planet, the heat gauge, logged as debug (#113)', () => {
    const debug = createDebugApi()
    expect(debug.setLiningType('refractory')).toEqual({ ok: true })
    expect(debug.setHeat(40)).toMatchObject({ ok: false })
    debug.setPlanet(8)
    expect(debug.setHeat(80)).toEqual({ ok: true })
    expect(debug.ui.getHudModel()).toMatchObject({
      model: { heat: { text: '80 / 100', isThrottled: true } },
    })
    expect(debug.setLiningType('asbestos')).toMatchObject({ ok: false })
    expect(sink.commands.map((command) => command.type)).toContain('debug.setLiningType')
  })

  it('sets an upgrade level as a logged debug command, with finite stats at drill_tip 1500', () => {
    const debug = createDebugApi()
    expect(debug.setUpgrade('drill_tip', 1500)).toEqual({ ok: true })
    expect(vehicleStatsOf(debug).stats.drillTip).toMatch(/^[0-9.]+e\+\d+$/)
    expect(sink.commands.map((command) => command.type)).toEqual(['debug.setUpgrade'])
    expect(sink.events.map((event) => event.event)).toEqual([
      'vehicle_configuration_changed',
      'debug_command_applied',
    ])
    expect(sink.events[0].data).toEqual({ visualTier: 3 })
    expect(game().debugApplied).toBe(true)
  })

  it.each([
    ['drill tracks first', ['drill_power', 'drill_tip', 'engine', 'boiler', 'cargo_hold', 'hull']],
    ['hull first', ['hull', 'cargo_hold', 'boiler', 'engine', 'drill_tip', 'drill_power']],
  ])('crosses T2 then T3 with one tier change logged each, in any order (%s)', (_order, tracks) => {
    // T2 = 8 and T3 = 20 (#20): 4 majors per track (step 40) sum 4, 8, ..., 24.
    const debug = createDebugApi()
    const tiers = tracks.map((track) => {
      debug.setUpgrade(track, 40)
      return game().vehicle.visualTier
    })
    expect(tiers).toEqual([1, 2, 2, 2, 3, 3])
    const changes = sink.events.filter((event) => event.event === 'vehicle_configuration_changed')
    expect(changes.map((event) => event.data)).toEqual([{ visualTier: 2 }, { visualTier: 3 }])
  })

  it('sets energy and hull from canonical strings', () => {
    const debug = createDebugApi()
    expect(debug.setEnergy('37.5')).toEqual({ ok: true })
    expect(debug.setHull('5e+1')).toEqual({ ok: true })
    expect(game().vehicle).toMatchObject({ energy: 9000, hull: fromCanonical('50') })
  })

  it('refuses an unknown track, a level that is not an integer, or energy and hull out of range', () => {
    const debug = createDebugApi()
    const results = [
      debug.setUpgrade('laser', 1),
      debug.setUpgrade('engine', 1.5),
      debug.setEnergy('151'),
      debug.setEnergy('0.001'),
      debug.setHull('101'),
    ]
    expect(results.every((result) => !result.ok)).toBe(true)
    expect(sink.commands).toEqual([])
    expect(game().vehicle.energy).toBe(150 * 240)
  })

  it('saves integer levels only, so a restore recomputes the same stats', () => {
    const debug = createDebugApi()
    debug.setUpgrade('hull', 6)
    const taken = debug.snapshot()
    if (!taken.ok) throw new Error('snapshot refused')
    const savedVehicle = JSON.parse(JSON.stringify(taken.snapshot)).state.players.player_1.vehicle
    expect(savedVehicle.levels).toMatchObject({ hull: 6 })
    expect(Object.keys(savedVehicle)).not.toContain('hullMax')
    const before = vehicleStatsOf(debug).stats
    startRun()
    expect(debug.restore(JSON.parse(JSON.stringify(taken.snapshot)))).toMatchObject({ ok: true })
    expect(vehicleStatsOf(debug).stats).toEqual(before)
  })
})

describe('debug api: combat', () => {
  const belowTheDock = { dx: 4, dy: -3 }

  it('spawns, freezes and clears enemies as logged debug commands', () => {
    const debug = createDebugApi()
    expect(debug.freezeEnemies(true)).toEqual({ ok: true })
    expect(debug.spawnEnemy('burrower', 9, belowTheDock)).toEqual({ ok: true })
    expect(debug.clearEnemies()).toEqual({ ok: true })
    expect(sink.commands.map((command) => command.type)).toEqual([
      'debug.freezeEnemies',
      'debug.spawnEnemy',
      'debug.clearEnemies',
    ])
    expect(sink.events.map((event) => event.event)).toEqual([
      'debug_command_applied',
      'enemy_spawned',
      'enemy_type_encountered',
      'debug_command_applied',
      'enemy_despawned',
      'debug_command_applied',
    ])
    expect(sink.events[1].data).toEqual({
      enemyId: 'e1',
      kind: 'burrower',
      tier: 9,
      spawnPointId: 'debug',
    })
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
    expect(game().debugApplied).toBe(true)
  })

  it('refuses an unknown enemy kind or a place off the planet, and changes nothing', () => {
    const debug = createDebugApi()
    expect(debug.spawnEnemy('dragon', 1, belowTheDock)).toMatchObject({ ok: false })
    expect(debug.spawnEnemy('crawler', 1, { dx: 0, dy: 50 })).toMatchObject({ ok: false })
    expect(debug.enemyStatsTable('dragon')).toMatchObject({ ok: false })
    expect(sink.commands).toEqual([])
  })

  it('reads the crawler table for planets 1 to 40 without logging', () => {
    const table = createDebugApi().enemyStatsTable('crawler')
    if (!table.ok) throw new Error(table.problems.join('; '))
    expect(table.rows).toHaveLength(40)
    expect(table.rows[0]).toMatchObject({ planetIndex: 1, tierByBand: [1, 2, 3, 4, 5] })
    expect(table.rows[0].healthByBand[0]).toBe('7.84e+0')
    expect(table.rows[0].baseHitByBand[0]).toBe('1.96e+1')
    expect(sink.events).toEqual([])
    expect(sink.commands).toEqual([])
  })
})

describe('debug api: ui', () => {
  it('switches the camera to the fixed mode and back', () => {
    const debug = createDebugApi()
    expect(debug.ui.setCameraMode('fixed')).toEqual({ ok: true })
    expect(debug.ui.getPrefs()).toMatchObject({ ok: true, prefs: { cameraMode: 'fixed' } })
    debug.ui.setCameraMode('rotating')
    expect(game().prefs.cameraMode).toBe('rotating')
  })

  it('refuses a camera mode it does not know and keeps the current one', () => {
    const debug = createDebugApi()
    expect(debug.ui.setCameraMode('upside-down')).toEqual({
      ok: false,
      problems: ['camera mode must be one of rotating, fixed, got "upside-down"'],
    })
    expect(game().prefs.cameraMode).toBe('rotating')
  })

  it('changes only the view: no command, no log line, no debug flag, the same digest', () => {
    const debug = createDebugApi()
    const before = takeSessionSnapshot()
    debug.ui.setCameraMode('fixed')
    expect(takeSessionSnapshot().digest).toBe(before.digest)
    expect(sink.events).toEqual([])
    expect(sink.commands).toEqual([])
    expect(game().debugApplied).toBe(false)
  })
})

function minimalScenarioFor(name: string) {
  return { scenarioVersion: 1, name, worldSeed: 83921, start: {} }
}

describe('debug API: platform', () => {
  it('accepts level 1 for each facility and changes nothing', () => {
    const before = takeSessionSnapshot().digest
    for (const facilityId of ['shop', 'workshop', 'charging']) {
      expect(createDebugApi().setFacilityLevel(facilityId, 1)).toEqual({ ok: true })
    }
    expect(takeSessionSnapshot().digest).toBe(before)
  })

  it('lists a problem for any other level and for an unknown facility', () => {
    expect(createDebugApi().setFacilityLevel('workshop', 2)).toEqual({
      ok: false,
      problems: ['facilities have no levels in the slice: level must be 1, got 2'],
    })
    expect(createDebugApi().setFacilityLevel('refinery', 0)).toMatchObject({
      ok: false,
      problems: [expect.stringContaining('"refinery" is not a facility'), expect.any(String)],
    })
  })
})

describe('debug api: casing (#41)', () => {
  const HOLE = { x: 20_500, y: 288_500 }
  const casingGrade = () => takeSessionSnapshot().state.players[game().playerId].vehicle.casingGrade

  it('sets the casing grade as a logged debug command', () => {
    expect(createDebugApi().setCasingGrade(4)).toEqual({ ok: true })
    expect(casingGrade()).toBe(4)
    expect(game().debugApplied).toBe(true)
    expect(sink.events.map((event) => event.event)).toEqual(['debug_command_applied'])
  })

  it('refuses a casing grade of 0 and changes nothing', () => {
    expect(createDebugApi().setCasingGrade(0)).toMatchObject({ ok: false })
    expect(sink.commands).toEqual([])
    expect(casingGrade()).toBe(1)
  })

  it('lines a ring in a carved hole and logs it as casing_placed', () => {
    const debug = createDebugApi()
    debug.carveCircle(HOLE.x, HOLE.y, 950)
    expect(debug.lineCasing(HOLE.x, HOLE.y, 3)).toEqual({ ok: true })
    const placed = sink.events.find((event) => event.event === 'casing_placed')
    expect(placed?.data).toMatchObject({ relined: 0, grade: 3 })
    expect(sink.events.at(-1)?.event).toBe('debug_command_applied')
  })
})

describe('debug api: collapse (#43)', () => {
  const BLOCK = '0,8#17'

  it('forces a block to collapse after its full warning, as logged debug commands', () => {
    const debug = createDebugApi()
    expect(debug.forceCollapse(BLOCK)).toEqual({ ok: true })
    expect(sink.events.map((event) => event.event)).toEqual([
      'collapse_warning',
      'debug_command_applied',
    ])
    const report = debug.collapseState()
    expect(report).toMatchObject({
      ok: true,
      collapsing: [{ block: BLOCK, phase: 'warning', isForced: true }],
    })
    debug.fastForward(60)
    expect(sink.events.map((event) => event.event)).toContain('collapse')
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('refuses a block name that is not one and changes nothing', () => {
    expect(createDebugApi().forceCollapse('here')).toMatchObject({ ok: false })
    expect(sink.commands).toEqual([])
    expect(createDebugApi().collapseState()).toEqual({ ok: true, weakBlocks: [], collapsing: [] })
  })
})

describe('debug api: features', () => {
  it("answers a slice's registered action under features and its slice id", () => {
    const probe: SliceDefinition = {
      id: 'probe',
      register: (r) => r.debugActions({ describe: () => ({ ok: true, sliceId: 'probe' }) }),
    }
    const answer = withRegistrations([probe], () => createDebugApi().features.probe.describe())
    expect(answer).toEqual({ ok: true, sliceId: 'probe' })
    expect(sink.commands).toEqual([])
  })
})

describe('debug api: loadout (K4)', () => {
  const drillGear: SliceDefinition = {
    id: 'drill-gear',
    register: (r) =>
      r.content('vehicle-item', [
        {
          id: 'drill-gear.twin_bit',
          iconId: 'item-gear-twin-bit',
          slots: ['drill.head'],
          attach: 'drill.head',
        },
      ]),
  }

  it('replaces the vehicle loadout as a logged debug command', () => {
    const answer = withRegistrations([drillGear], () =>
      createDebugApi().setVehicleLoadout({ 'drill.head': 'drill-gear.twin_bit' }),
    )
    expect(answer).toEqual({ ok: true })
    expect(readLocalVehicle().loadout).toMatchObject({
      slots: { 'drill.head': 'drill-gear.twin_bit', 'powerup.1': null },
      owned: ['drill-gear.twin_bit'],
    })
    expect(sink.commands.map((command) => command.type)).toEqual(['debug.setVehicleLoadout'])
    expect(sink.events.map((event) => event.event)).toEqual(['debug_command_applied'])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('refuses an item in a slot it does not go in, applying nothing', () => {
    const answer = withRegistrations([drillGear], () =>
      createDebugApi().setVehicleLoadout({ 'powerup.1': 'drill-gear.twin_bit' }),
    )
    expect(answer).toEqual({
      ok: false,
      problems: ['"drill-gear.twin_bit" does not go in powerup.1'],
    })
    expect(sink.commands).toEqual([])
  })
})
