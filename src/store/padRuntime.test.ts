import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import { searSlice } from '../systems/authority/bore/boreAutoFixtures'
import type { Authority } from '../systems/authority/loopbackAuthority'
import { ACTION_MAP, defaultBindings, defaultPadBindings } from '../systems/input/actionMap'
import { PAD_INPUTS } from '../systems/input/padCodes'
import type { PadReading } from '../systems/input/padFrame'
import { readPreferences } from '../systems/input/preferences'
import { FACING } from '../systems/vehicle/vehiclePose'
import { createStartingAuthority, resetGameStore, useGameStore } from './gameStore'
import {
  readActionStream,
  readVehicleIntent,
  releaseAction,
  pressAction,
  resetInput,
} from './inputRuntime'
import { readPadAim, resetPad, routePadFrame } from './padRuntime'
import { installPreferencesStorage, loadPreferences, preferencesWrites } from './preferencesFile'

let submitted: AuthorityCommand[]

function spyAuthority(): Authority {
  const real = createStartingAuthority()
  return {
    ...real,
    submit: (command) => {
      submitted.push(command)
      real.submit(command)
    },
  }
}

beforeEach(() => {
  submitted = []
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore(spyAuthority())
  resetInput()
  resetPad()
})

afterEach(() => {
  uninstallRunLog()
  installPreferencesStorage(null)
})

const game = () => useGameStore.getState()

/** A standard pad with these codes fully pressed and the right stick at `aim`. */
function padHolding(codes: readonly string[], aim: readonly [number, number] = [0, 0]): PadReading {
  const buttons = Array.from({ length: 17 }, () => ({ value: 0 }))
  const axes = [0, 0, aim[0], aim[1]]
  for (const input of PAD_INPUTS.filter((candidate) => codes.includes(candidate.code))) {
    if (input.source.kind === 'button') buttons[input.source.index] = { value: 1 }
    else axes[input.source.index] = input.source.sign
  }
  return { buttons, axes }
}

const IDLE_PAD = padHolding([])

/** `seconds` of frames at `framesPerSecond`, each polling the same pad. */
function pollFor(pad: PadReading, seconds: number, framesPerSecond: number): void {
  for (let frame = 0; frame < seconds * framesPerSecond; frame++) routePadFrame(pad)
}

function submittedDuring(run: () => void): string[] {
  const before = submitted.length
  run()
  return submitted.slice(before).map((command) => command.type)
}

const edgesOf = () => readActionStream().map((edge) => `${edge.actionId}${edge.isDown ? '+' : '-'}`)

function tap(action: Parameters<typeof pressAction>[0]): void {
  pressAction(action)
  releaseAction(action)
}

describe('gamepad adapter: the key path under pad codes (ticket 346)', () => {
  it.each([30, 60, 144])('presses a held button once at %i frames per second', (rate) => {
    const types = submittedDuring(() => pollFor(padHolding(['PadA']), 2, rate))
    expect(types).toEqual(['dock'])
    expect(edgesOf()).toEqual(['interact+'])
  })

  it('drives with the left stick while it is pushed and stops when it rests', () => {
    routePadFrame(padHolding(['PadLStickRight']))
    expect(readVehicleIntent()).toEqual({ moveX: 1, facing: FACING.right, lift: false })
    routePadFrame(IDLE_PAD)
    expect(readVehicleIntent().moveX).toBe(0)
    expect(edgesOf()).toEqual(['aim_right+', 'aim_right-'])
  })

  it('lets go of a stick held while docking, so nothing sticks on the way out', () => {
    routePadFrame(padHolding(['PadLStickRight']))
    tap('interact')
    expect(game().vehicle.mode).toBe('docked')
    routePadFrame(IDLE_PAD)
    tap('ui_cancel')
    expect(readVehicleIntent().moveX).toBe(0)
  })

  it('lets go of everything when the pad disconnects', () => {
    routePadFrame(padHolding(['PadLStickLeft']))
    routePadFrame(null)
    expect(readVehicleIntent().moveX).toBe(0)
    expect(readPadAim()).toBeNull()
  })

  it('zooms with LB held and the d-pad, and the d-pad alone uses a slot instead', () => {
    const before = game().prefs.viewShortAxisMetres
    routePadFrame(padHolding(['PadLB', 'PadUp']))
    expect(game().prefs.viewShortAxisMetres).toBeLessThan(before)
    routePadFrame(IDLE_PAD)
    routePadFrame(padHolding(['PadUp']))
    expect(edgesOf()).toEqual(['zoom_in+', 'use_slot_1+'])
  })

  it('opens settings with Start and closes them with Start or B', () => {
    routePadFrame(padHolding(['PadStart']))
    expect(game().isSettingsOpen).toBe(true)
    routePadFrame(IDLE_PAD)
    routePadFrame(padHolding(['PadB']))
    expect(game().isSettingsOpen).toBe(false)
  })
})

describe('gamepad adapter: the bore gun (ticket 346, #317)', () => {
  it('toggles auto-shoot once per right-stick click, however long it is held', () => {
    const types = withRegistrations([searSlice()], () =>
      submittedDuring(() => {
        pollFor(padHolding(['PadRS']), 1, 60)
        routePadFrame(IDLE_PAD)
        pollFor(padHolding(['PadRS']), 1, 144)
      }),
    )
    expect(types).toEqual(['ground_gun.set_auto', 'ground_gun.set_auto'])
  })

  it('reads the right stick as an aim in screen directions, and as none at rest', () => {
    routePadFrame(padHolding([], [0.8, -0.2]))
    expect(readPadAim()).toEqual({ x: 0.8, y: -0.2 })
    routePadFrame(padHolding([], [0.1, 0.1]))
    expect(readPadAim()).toBeNull()
  })

  it('aims without pressing any action', () => {
    pollFor(padHolding([], [0, 1]), 1, 60)
    expect(edgesOf()).toEqual([])
    expect(submitted).toEqual([])
  })
})

// A hold-to-use slot sends a release when its button comes up (ticket 332), as for keys.
const RELEASE_PROBE: SliceDefinition = {
  id: 'release-probe',
  register: (r) => {
    r.inputReaction({
      id: 'release-probe.use_3',
      actionId: 'use_slot_3',
      contexts: ['vehicle'],
      toIntent: () => ({ type: 'requestRescue', payload: {} }),
      toReleaseIntent: () => ({ type: 'quickService', payload: {} }),
    })
  },
}

describe('gamepad adapter: any-layer release (#332)', () => {
  it('sends the release when a pad button comes up after docking, as a key does', () => {
    const types = withRegistrations([RELEASE_PROBE], () =>
      submittedDuring(() => {
        routePadFrame(padHolding(['PadDown']))
        tap('interact')
        expect(game().vehicle.mode).toBe('docked')
        routePadFrame(IDLE_PAD)
      }),
    )
    expect(types).toEqual(['requestRescue', 'dock', 'quickService'])
  })
})

describe('gamepad adapter: rebinding', () => {
  it('rebinds the waiting action to the next pad chord and keeps its keys', () => {
    routePadFrame(padHolding(['PadLB']))
    game().startRebinding('interact')
    routePadFrame(padHolding(['PadLB', 'PadX']))
    expect(game().padBindings.interact).toEqual(['PadLB+PadX'])
    expect(game().bindings).toEqual(defaultBindings(ACTION_MAP))
    expect(game().rebindingActionId).toBeNull()
  })

  it('cancels a capture with Start and refuses a button another action uses', () => {
    game().startRebinding('interact')
    routePadFrame(padHolding(['PadStart']))
    expect(game().rebindingActionId).toBeNull()
    routePadFrame(IDLE_PAD)
    game().startRebinding('interact')
    routePadFrame(padHolding(['PadY']))
    expect(game().padBindings).toEqual(defaultPadBindings(ACTION_MAP))
    expect(game().bindingProblems).toEqual([
      'PadY is bound to both interact and request_rescue in the vehicle context',
    ])
  })

  it('keeps a pad rebinding when the key of the same action is rebound after it', () => {
    routePadFrame(padHolding(['PadLB']))
    game().startRebinding('interact')
    routePadFrame(padHolding(['PadLB', 'PadX']))
    game().startRebinding('interact')
    expect(game().rebindToChord('KeyJ')).toEqual([])
    expect(game().prefs.bindings.interact).toEqual({ gamepad: ['PadLB+PadX'], keyboard: ['KeyJ'] })
  })

  it('round-trips a pad rebinding through the preferences file', async () => {
    let file: string | null = null
    installPreferencesStorage({
      read: async () => file,
      write: async (json) => {
        file = json
      },
    })
    routePadFrame(padHolding(['PadLB']))
    game().startRebinding('use_slot_5')
    routePadFrame(padHolding(['PadLB', 'PadX']))
    await preferencesWrites()
    expect(readPreferences(file).prefs.bindings).toEqual({
      use_slot_5: { gamepad: ['PadLB+PadX'] },
    })
    resetGameStore(spyAuthority())
    game().adoptPreferences(await loadPreferences())
    expect(game().padBindings.use_slot_5).toEqual(['PadLB+PadX'])
  })
})
