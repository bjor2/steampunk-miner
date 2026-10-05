import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import type { KeyChange } from '../shell/shell'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import type { Authority } from '../systems/authority/loopbackAuthority'
import type { ActionId } from '../systems/input/actionMap'
import { readPreferences } from '../systems/input/preferences'
import { FACING } from '../systems/vehicle/vehiclePose'
import {
  createStartingAuthority,
  resetGameStore,
  takeSessionSnapshot,
  useGameStore,
} from './gameStore'
import {
  pressAction,
  readVehicleIntent,
  releaseAction,
  resetInput,
  routeKeyChange,
} from './inputRuntime'
import { installPreferencesStorage, preferencesWrites } from './preferencesFile'

let submitted: AuthorityCommand[]
let clockMoves: number
let sink: ReturnType<typeof createMemorySink>

/** The real authority behind a spy that counts every call that can change state. */
function spyAuthority(): Authority {
  const real = createStartingAuthority()
  return {
    ...real,
    submit: (command) => {
      submitted.push(command)
      real.submit(command)
    },
    advanceTo: (tick) => {
      clockMoves += 1
      real.advanceTo(tick)
    },
  }
}

beforeEach(() => {
  submitted = []
  clockMoves = 0
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  resetGameStore(spyAuthority())
  resetInput()
})

afterEach(() => {
  uninstallRunLog()
  installPreferencesStorage(null)
})

const game = () => useGameStore.getState()

const key = (code: string, isDown: boolean, extra: Partial<KeyChange> = {}): KeyChange => ({
  code,
  isDown,
  isRepeat: false,
  isShiftHeld: false,
  ...extra,
})

function tap(action: ActionId): void {
  pressAction(action)
  releaseAction(action)
}

/** The command types submitted while `run` runs. */
function submittedDuring(run: () => void): string[] {
  const before = submitted.length
  run()
  return submitted.slice(before).map((command) => command.type)
}

function dockAtStart(): void {
  tap('interact')
  expect(game().vehicle.mode).toBe('docked')
}

/** Standing on the surface 20 tiles right of the pad, out of its zone. */
const poseAway = {
  x: 20_500,
  y: 297_500,
  vx: 0,
  vy: 0,
  upx: 0,
  upy: 1024,
  facing: FACING.right,
  driving: false,
  thrusting: false,
  drilling: false,
  thrustTicks: 0,
  driveTicks: 0,
  drillTicks: 0,
}

describe('input: no direct mutation (#33 acceptance 3)', () => {
  it('docks with interact, and only through a submitted Dock', () => {
    expect(submittedDuring(() => tap('interact'))).toEqual(['dock'])
    expect(clockMoves).toBe(0)
  })

  it('undocks when ui_cancel closes the platform screen', () => {
    dockAtStart()
    expect(submittedDuring(() => tap('ui_cancel'))).toEqual(['undock'])
  })

  it('runs the quick service on the platform screen', () => {
    dockAtStart()
    expect(submittedDuring(() => tap('quick_service'))).toEqual(['quickService'])
  })

  it('calls the tow for a stranded vehicle', () => {
    game().reportPose(poseAway)
    game().setEnergy('0')
    expect(game().vehicle.mode).toBe('stranded')
    expect(submittedDuring(() => tap('request_rescue'))).toEqual(['requestRescue'])
  })

  it('submits the platform buttons as their commands', () => {
    dockAtStart()
    game().giveMoney('1e6')
    game().setEnergy('100')
    const pressed = submittedDuring(() => {
      game().pressScreenButton('workshop-upgrade-engine-buy')
      game().pressScreenButton('charging-recharge')
    })
    expect(pressed).toEqual(['buyUpgrade', 'rechargeEnergy'])
  })

  it('submits nothing for an action outside its context or a disabled button', () => {
    expect(submittedDuring(() => tap('quick_service'))).toEqual([])
    dockAtStart()
    expect(submittedDuring(() => tap('interact'))).toEqual([])
    expect(submittedDuring(() => game().pressScreenButton('workshop-upgrade-hull-buy'))).toEqual([])
  })

  it('submits once per key press, never for the auto-repeat', () => {
    const presses = submittedDuring(() => {
      routeKeyChange(key('KeyE', true))
      routeKeyChange(key('KeyE', true, { isRepeat: true }))
      routeKeyChange(key('KeyE', false))
    })
    expect(presses).toEqual(['dock'])
  })
})

describe('input: travel confirmation', () => {
  it('submits one Travel on the second press and none on the first', () => {
    dockAtStart()
    game().setCoreFragments(63)
    game().giveMoney('60.8')
    expect(submittedDuring(() => game().pressScreenButton('platform-travel'))).toEqual([])
    expect(game().isTravelArmed).toBe(true)
    expect(submittedDuring(() => game().pressScreenButton('platform-travel'))).toEqual(['travel'])
    expect(game().planetTier).toBe(2)
  })

  it('does not arm a travel the authority would refuse', () => {
    dockAtStart()
    expect(game().pressScreenButton('platform-travel')).toBe(false)
    expect(game().isTravelArmed).toBe(false)
  })
})

describe('input: keys, layers and the vehicle intent', () => {
  it('drives with the held key and stops on release', () => {
    routeKeyChange(key('KeyD', true))
    expect(readVehicleIntent()).toEqual({ moveX: 1, facing: FACING.right, lift: false })
    routeKeyChange(key('KeyD', false))
    expect(readVehicleIntent().moveX).toBe(0)
  })

  it('gives a rebound key the intent the default key gave, without touching the session', () => {
    const digest = takeSessionSnapshot().digest
    routeKeyChange(key('KeyA', true))
    const before = readVehicleIntent()
    routeKeyChange(key('KeyA', false))
    expect(game().setBindings({ aim_left: { keyboard: ['KeyJ'] } })).toEqual([])
    routeKeyChange(key('KeyJ', true))
    expect(readVehicleIntent()).toEqual(before)
    expect(takeSessionSnapshot().digest).toBe(digest)
    expect(submitted).toEqual([])
  })

  it('rebinds the waiting action to the next key, and refuses a key another action uses', () => {
    game().startRebinding('aim_left')
    routeKeyChange(key('KeyJ', true))
    expect(game().bindings.aim_left).toEqual(['KeyJ'])
    game().startRebinding('aim_left')
    routeKeyChange(key('KeyE', true))
    expect(game().bindings.aim_left).toEqual(['KeyJ'])
    expect(game().bindingProblems).toEqual([
      'KeyE is bound to both aim_left and interact in the vehicle context',
    ])
  })

  it('opens settings with Escape, idles the vehicle there, and closes it with Escape', () => {
    routeKeyChange(key('KeyD', true))
    routeKeyChange(key('Escape', true))
    expect(game().isSettingsOpen).toBe(true)
    expect(readVehicleIntent().moveX).toBe(0)
    routeKeyChange(key('Escape', false))
    routeKeyChange(key('Escape', true))
    expect(game().isSettingsOpen).toBe(false)
  })

  it('releases a key held while docking, so nothing sticks on the way out', () => {
    routeKeyChange(key('KeyD', true))
    dockAtStart()
    routeKeyChange(key('KeyD', false))
    tap('ui_cancel')
    expect(readVehicleIntent().moveX).toBe(0)
  })

  it('confirms the quick action first on the platform screen', () => {
    dockAtStart()
    game().setEnergy('100')
    game().giveMoney('10')
    expect(submittedDuring(() => tap('ui_confirm'))).toEqual(['quickService'])
  })

  it('moves focus with the menu keys and jumps panels with Tab, from the quick action', () => {
    dockAtStart()
    tap('ui_next_panel')
    expect(game().focusedControlId).toBe('shop-sell-all')
    tap('ui_down')
    expect(game().focusedControlId).toBe('workshop-upgrade-drill_power-buy')
    tap('ui_prev_panel')
    expect(game().focusedControlId).toBe('shop-sell-all')
  })
})

describe('preferences: settings and rebinding stay local', () => {
  it('writes a changed setting to the preferences file and reads it back', async () => {
    let file: string | null = null
    installPreferencesStorage({
      read: async () => file,
      write: async (json) => {
        file = json
      },
    })
    game().setPreference('flashes', false)
    game().setBindings({ lift: { keyboard: ['KeyL'] } })
    await preferencesWrites()
    expect(readPreferences(file).prefs).toMatchObject({
      flashes: false,
      bindings: { lift: { keyboard: ['KeyL'] } },
    })
  })

  it('never logs a settings change or sends it to the authority', () => {
    game().setCameraMode('fixed')
    game().togglePreference('shake')
    game().setBindings({ lift: { keyboard: ['KeyL'] } })
    expect(sink.events).toEqual([])
    expect(submitted).toEqual([])
  })
})
