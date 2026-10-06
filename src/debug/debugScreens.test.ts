import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { ALL_RUN_EVENT_NAMES } from '../logging/eventNames'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { readAuthorityState } from '../store/authorityLink'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../store/gameStore'
import { resetInput } from '../store/inputRuntime'
import { cameraPresence } from '../scene/cameraPresence'
import { lightPresence } from '../scene/lightPresence'
import { renderPresence } from '../scene/renderPresence'
import { fromCanonical, toCanonical } from '../systems/money'
import { musicStingersOf } from '../systems/audio/musicStingers'
import { firstDigestMismatch, replayRun } from '../systems/replay/replayRun'
import { bayPoseAt } from '../systems/vehicle/vehiclePose'
import { dockSiteOf } from '../systems/world/dockSite'
import { planetParamsFor } from '../systems/world/planetParams'
import { createDebugApi } from './debugApi'

// #33 acceptance at the debug API seam: what a Playwright spec can do through
// window.steampunkDebug without clicking pixels.

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  resetInput()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()
const canonical = (text: string) => toCanonical(fromCanonical(text))

function hudModel() {
  const result = createDebugApi().ui.getHudModel()
  if (!result.ok) throw new Error(result.problems.join('; '))
  return result.model
}

function sellBayModel() {
  const result = createDebugApi().ui.getSellBayModel()
  if (!result.ok) throw new Error(result.problems.join('; '))
  return result.model
}

function upgradeBayModel() {
  const result = createDebugApi().ui.getUpgradeBayModel()
  if (!result.ok) throw new Error(result.problems.join('; '))
  return result.model
}

/** Leaves the Sell bay and drives 8 m onto the Upgrade bay's pad, as the pose reports say (#37). */
function driveToUpgradeBay(): void {
  const debug = createDebugApi()
  debug.input.tap('ui_cancel')
  const site = dockSiteOf(planetParamsFor(1, 1))
  const tick = takeSessionSnapshot().tick + 2
  const payload = { ...bayPoseAt(site, 'upgrade'), ...IDLE, driveTicks: 2 }
  debug.fastForward(2, [{ tick, type: 'reportPose', payload }])
}

const IDLE = {
  driving: false,
  thrusting: false,
  drilling: false,
  thrustTicks: 0,
  driveTicks: 0,
  drillTicks: 0,
}

/**
 * A UI-driven trip over both bays: dock with interact and run the quick action at the Sell bay,
 * drive to the Upgrade bay, dock, buy a track and a casing grade with buttons, travel with two
 * presses.
 */
function playThroughTheScreens(): void {
  const debug = createDebugApi()
  debug.giveMoney('1000')
  debug.setCoreFragments(63)
  debug.setEnergy('100')
  debug.input.tap('interact')
  debug.input.tap('quick_service')
  driveToUpgradeBay()
  debug.input.tap('interact')
  game().pressScreenButton('workshop-upgrade-cargo_hold-buy')
  game().pressScreenButton('upgradebay-casing-buy')
  game().pressScreenButton('platform-travel')
  game().pressScreenButton('platform-travel')
  debug.input.tap('ui_cancel')
  debug.fastForward(120)
}

describe('debug api: ui reads the HUD and the platform screen (#33 acceptance 4)', () => {
  it('shows what setEnergy, setHull and teleportToDepth set, with the exact values', () => {
    const debug = createDebugApi()
    debug.setEnergy('112')
    debug.setHull('61.5')
    debug.teleportToDepthTiles(100)
    const hud = hudModel()
    expect(hud.energy).toMatchObject({ text: '112 / 150', exact: canonical('112') })
    expect(hud.hull).toMatchObject({ text: '62 / 100', exact: canonical('61.5') })
    expect(hud.depth.text).toBe('100')
    expect(hud.depth.band).toBeGreaterThanOrEqual(1)
    expect(hud.cargo.text).toBe('0 / 10')
  })

  it('reads the bay screens with the core bay and money from the state', () => {
    const debug = createDebugApi()
    debug.giveMoney('1e400')
    debug.setCoreFragments(17)
    expect(upgradeBayModel().header).toEqual({
      ...sellBayModel().header,
      bay: 'upgrade',
      bayName: 'Upgrade bay',
      accent: 'teal',
    })
    const { header } = sellBayModel()
    expect(header).toMatchObject({
      coreBay: { text: '17 / 63' },
      money: { exact: canonical('1e400') },
    })
    expect(header.money.text).not.toContain('NaN')
  })
})

describe('debug api: input acts like play (#33 acceptance 3 and 11)', () => {
  it('logs a tapped dock as an ordinary player command, not a debug one', () => {
    createDebugApi().input.tap('interact')
    expect(sink.commands.map((command) => command.type)).toEqual(['dock'])
    expect(sink.events.map((event) => event.event)).toContain('dock_entered')
    expect(game().debugApplied).toBe(false)
  })

  it('refuses an unknown action id and does nothing', () => {
    expect(createDebugApi().input.tap('warp')).toEqual({
      ok: false,
      problems: ['"warp" is not an action id'],
    })
    expect(sink.commands).toEqual([])
  })

  it('reads and sets bindings refused whole', () => {
    const debug = createDebugApi()
    expect(debug.input.setBindings({ aim_left: { keyboard: ['KeyJ'] } })).toEqual({ ok: true })
    expect(debug.input.getBindings()).toMatchObject({
      ok: true,
      overrides: { aim_left: { keyboard: ['KeyJ'] } },
    })
    const refused = debug.input.setBindings({ aim_left: { keyboard: ['Escape'] } })
    expect(refused).toEqual({
      ok: false,
      problems: ['aim_left: Escape is reserved and cannot be rebound'],
    })
    expect(game().bindings.aim_left).toEqual(['KeyJ'])
  })

  it('docks at each bay with interact and buys at the Upgrade bay through its buttons', () => {
    playThroughTheScreens()
    const docks = sink.events.filter((event) => event.event === 'dock_entered')
    expect(docks.map((event) => (event.data as { bay: string }).bay)).toEqual(['sell', 'upgrade'])
    const names = sink.events.map((event) => event.event)
    expect(names).toEqual(expect.arrayContaining(['upgrade_purchased', 'casing_upgraded']))
    expect(names).not.toContain('command_rejected')
  })

  it('reads the Casing row and a focused track preview through ui.getUpgradeBayModel', () => {
    const debug = createDebugApi()
    debug.giveMoney('100')
    debug.teleportToDock('upgrade')
    const digest = takeSessionSnapshot().digest
    game().moveFocus(1)
    const model = upgradeBayModel()
    expect(model.casing).toMatchObject({ grade: 1, gradeText: '1 → 2', cost: { text: '48' } })
    expect(model.preview).toMatchObject({
      highlight: 'drill_tip',
      visualTier: 1,
      liningGrade: null,
    })
    expect(takeSessionSnapshot().digest).toBe(digest)
  })

  it('emits only registered events in a run driven through the screens', () => {
    playThroughTheScreens()
    expect(game().planetTier).toBe(2)
    for (const event of sink.events) expect(runEventProblems(event)).toEqual([])
  })

  it('replays a screen-driven run from its commands to the same digests', () => {
    playThroughTheScreens()
    const logged = sink.events
      .filter((event) => event.event === 'state_digest')
      .map((event) => ({ tick: event.tick, ...(event.data as { digest: string; scope: never }) }))
    const replay = replayRun(1, sink.commands, {
      playerIds: ['player_1'],
      endTick: takeSessionSnapshot().tick,
    })
    const replayedBeforeEnd = replay.digests.filter((record) => record.scope !== 'end')
    expect(logged.length).toBeGreaterThan(0)
    expect(firstDigestMismatch(logged, replayedBeforeEnd)).toBeNull()
    expect(replay.digests.at(-1)?.digest).toBe(takeSessionSnapshot().digest)
  })

  it('registers the 56 event names from before the controls and HUD, plus hint_shown, casing, the four #46 artefact events, collapse, the lining charge, the tunnel wrecker, the guns, the refinery and the lining bill', () => {
    // #41 added `casing_upgraded`, `casing_placed`, `casing_drilled` and the two grade edges; #46 four
    // artefact events; #43 `collapse_warning`, `collapse_cancelled` and `collapse`; #76 `casing_lined`;
    // #111 `ring_gnawed`, `wrecker_spawned` and `wrecker_fled`; #93 `gun_mounted`, `gun_upgraded`,
    // `gun_hit` and `gun_mode`; #105 `refine_queued`, `refine_ready`, `refine_collected` and
    // `refinery_slot_bought`; #115 `lining_settled`; the controls and the HUD still add none.
    expect(ALL_RUN_EVENT_NAMES).toHaveLength(62 + 4 + 3 + 1 + 3 + 4 + 4 + 1)
  })
})

describe('debug api: presentation never reaches the session (#33 acceptance 10)', () => {
  it('ends a scripted run on the same digest under every camera, shake and flash setting', () => {
    const digests = new Set<string>()
    for (const cameraMode of ['rotating', 'fixed']) {
      for (const isOn of [true, false]) {
        resetGameStore()
        resetInput()
        const debug = createDebugApi()
        debug.ui.setCameraMode(cameraMode)
        debug.ui.setPref('shake', isOn)
        debug.ui.setPref('flashes', !isOn)
        playThroughTheScreens()
        digests.add(takeSessionSnapshot().digest)
      }
    }
    expect(digests.size).toBe(1)
  })

  it('ends a scripted run on the same digest whatever the music volume and mute (#49)', () => {
    const digests = new Set<string>()
    for (const [musicVolume, musicMuted] of [
      [1, false],
      [0.25, false],
      [1, true],
    ] as const) {
      resetGameStore()
      resetInput()
      const debug = createDebugApi()
      debug.ui.setPref('musicVolume', musicVolume)
      debug.ui.setPref('musicMuted', musicMuted)
      playThroughTheScreens()
      digests.add(takeSessionSnapshot().digest)
    }
    expect(digests.size).toBe(1)
  })

  it('keeps settings out of the log and the commands', () => {
    const debug = createDebugApi()
    debug.ui.setPref('hintsEnabled', false)
    debug.input.setBindings({ lift: { keyboard: ['KeyL'] } })
    expect(sink.events).toEqual([])
    expect(sink.commands).toEqual([])
    expect(debug.ui.getPrefs()).toMatchObject({ ok: true, prefs: { hintsEnabled: false } })
  })

  it('refuses a setting it does not know', () => {
    expect(createDebugApi().ui.setPref('volume', 3)).toEqual({
      ok: false,
      problems: [
        '"volume" is not a setting (cameraMode, shake, flashes, hintsEnabled, musicMuted, musicVolume)',
      ],
    })
  })
})

function audioModel() {
  const result = createDebugApi().ui.getAudioModel()
  if (!result.ok) throw new Error(result.problems.join('; '))
  return result.model
}

describe('debug api: the audio model reads the drill voice (#41)', () => {
  it('sings the casing drill voice with lining at the drill nose, the rock voice without (#41)', () => {
    const debug = createDebugApi()
    debug.teleportToDepthTiles(8)
    expect(audioModel().drillVoice).toBe('rock')
    const pose = readAuthorityState().players[useGameStore.getState().playerId].vehicle.pose
    if (pose === null) throw new Error('the vehicle has no pose')
    debug.fillCircle(pose.x + 2000, pose.y, 1500)
    expect(audioModel().drillVoice).toBe('rock')
    debug.lineCasing(pose.x, pose.y, 2)
    expect(audioModel().drillVoice).toBe('casing')
  })
})

describe('debug api: the audio model reads the music from the session (#49)', () => {
  it('plays only the platform layer docked at the hub', () => {
    createDebugApi().teleportToDock()
    expect(audioModel().layers).toEqual({ platform: 1, ambience: 0, tension: 0, combat: 0 })
  })

  it('brings the tension layer in at band 4', () => {
    const debug = createDebugApi()
    debug.teleportToDepth(7000)
    expect(hudModel().depth.band).toBe(4)
    expect(audioModel().layers.tension).toBeGreaterThan(0)
  })

  it('plays the combat layer with an enemy 7 m away and not 9 m away', () => {
    const debug = createDebugApi()
    debug.freezeEnemies(true)
    debug.spawnEnemy('burrower', 1, { dx: 0, dy: -7 })
    expect(audioModel().layers.combat).toBeGreaterThan(0)
    debug.clearEnemies()
    debug.spawnEnemy('burrower', 1, { dx: 0, dy: -9 })
    expect(audioModel().layers.combat).toBe(0)
  })

  it('records exactly one dock stinger when the vehicle docks', () => {
    createDebugApi().input.tap('interact')
    expect(game().vehicle.mode).toBe('docked')
    expect(audioModel().stingers).toEqual(['dock'])
  })

  it('replays a run from its commands to the same stinger sequence', () => {
    playThroughTheScreens()
    const replay = replayRun(1, sink.commands, {
      playerIds: ['player_1'],
      endTick: takeSessionSnapshot().tick,
    })
    expect(audioModel().stingers.length).toBeGreaterThan(0)
    expect(musicStingersOf(replay.events, 'player_1')).toEqual(audioModel().stingers)
  })

  it('reports the music settings and silences the bus when muted, logging nothing', () => {
    const debug = createDebugApi()
    debug.ui.setPref('musicVolume', 0.5)
    expect(audioModel()).toMatchObject({ musicVolume: 0.5, musicMuted: false, busGain: 0.5 })
    debug.ui.setPref('musicMuted', true)
    expect(audioModel()).toMatchObject({ musicMuted: true, busGain: 0 })
    expect(sink.events).toEqual([])
  })

  it('forgets the stingers with the run', () => {
    createDebugApi().input.tap('interact')
    resetGameStore()
    expect(audioModel().stingers).toEqual([])
  })
})

describe('debug api: zoom framing (#39)', () => {
  it('sets the zoom inside the 8 m to 20 m band, refuses it outside, and logs nothing', () => {
    const debug = createDebugApi()
    expect(debug.ui.setZoom(20)).toEqual({ ok: true })
    expect(debug.ui.setZoom(6)).toEqual({
      ok: false,
      problems: ['viewShortAxisMetres must be a number from 8 to 20, got 6'],
    })
    expect(debug.ui.getPrefs()).toMatchObject({ ok: true, prefs: { viewShortAxisMetres: 20 } })
    expect(sink.events).toEqual([])
    expect(sink.commands).toEqual([])
  })

  it.each([
    [1920, 1080],
    [3840, 2160],
  ])('reports 12 m and the collider at 7.5% of the short axis on a %i x %i canvas', (w, h) => {
    // As `PlanetCamera` writes it each frame once the default zoom has settled.
    Object.assign(cameraPresence, { widthPixels: w, heightPixels: h, viewShortAxisMetres: 12 })
    const result = createDebugApi().ui.getCameraView()
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.view.viewShortAxisMetres).toBe(12)
    expect(result.view.vehicleColliderShare).toBeGreaterThanOrEqual(0.072)
    expect(result.view.vehicleColliderShare).toBeLessThanOrEqual(0.078)
    expect(result.view.pixelsPerMetre).toBe(h / 12)
  })
})

describe('debug api: render scale and stats (#38)', () => {
  it('pins the render scale inside (0, 1], adapts again on null, and logs nothing', () => {
    const debug = createDebugApi()
    expect(debug.ui.setRenderScale(0.6)).toEqual({ ok: true })
    expect(game().renderScalePin).toBe(0.6)
    expect(debug.ui.setRenderScale(null)).toEqual({ ok: true })
    expect(game().renderScalePin).toBeNull()
    expect(debug.ui.setRenderScale(1.5)).toEqual({
      ok: false,
      problems: ['renderScale must be null or a number above 0 and at most 1, got 1.5'],
    })
    expect(sink.events).toEqual([])
    expect(sink.commands).toEqual([])
  })

  it('ends a scripted run on the same digest at every render scale and zoom (#38 acceptance 6)', () => {
    const digests = new Set<string>()
    for (const scale of [0.5, 1, null]) {
      for (const zoom of [8, 20]) {
        resetGameStore()
        resetInput()
        const debug = createDebugApi()
        debug.ui.setRenderScale(scale)
        debug.ui.setZoom(zoom)
        playThroughTheScreens()
        digests.add(takeSessionSnapshot().digest)
      }
    }
    expect(digests.size).toBe(1)
  })

  it('reports the last frame as the scene wrote it, with the lights in view', () => {
    // As `RenderPipeline`, `PlanetTerrain` and `LightRig` write them each frame.
    Object.assign(renderPresence, { drawCalls: 41, groundBlocks: 37, renderScale: 0.75 })
    lightPresence.pointLights.splice(0, Infinity, {
      id: 'platform-lamp',
      x: 0,
      y: 0,
      colour: '#ffffff',
      rangeM: 6,
      strength: 0.4,
    })
    const result = createDebugApi().ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.stats).toMatchObject({
      drawCalls: 41,
      groundBlocks: 37,
      renderScale: 0.75,
      headlamps: 1,
      pointLights: 1,
      pointLightIds: ['platform-lamp'],
    })
  })
})
