import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../../store/gameStore'
import { pressAction, releaseAction, resetInput } from '../../store/inputRuntime'
import type { ScreenProps } from '../registries/screens'
import { SliceScreenView } from './SliceScreen'

// A slice's full screen (ticket 211): the store holds one open, the shell draws it, and Back
// (Escape) dismisses it. A fake slice registers two through withRegistrations.

function probeScreenOf(name: string) {
  return function ProbeScreen(_props: ScreenProps) {
    return createElement('span', { 'data-testid': `screen-probe-${name}` }, name)
  }
}

const PROBE_SLICE: SliceDefinition = {
  id: 'screen-probe',
  register: (r) => {
    r.screen({ id: 'screen-probe.map', priority: 1, render: probeScreenOf('map') })
    r.screen({ id: 'screen-probe.alarm', priority: 5, render: probeScreenOf('alarm') })
  },
}

const game = () => useGameStore.getState()
const openScreenId = () => game().openScreenId
const shellMarkup = () =>
  renderToString(
    createElement(SliceScreenView, {
      openScreenId: openScreenId(),
      onDismiss: game().dismissScreen,
    }),
  )

function tapBack(): void {
  pressAction('ui_cancel')
  releaseAction('ui_cancel')
}

beforeEach(() => {
  resetGameStore()
  resetInput()
})

describe('slice screens', () => {
  it('draws nothing while no screen is open, registered or not', () => {
    expect(withRegistrations([], shellMarkup)).toBe('')
    expect(withRegistrations([PROBE_SLICE], shellMarkup)).toBe('')
  })

  it('draws the screen the store holds open, named in the frame', () => {
    const html = withRegistrations([PROBE_SLICE], () => {
      game().openScreen('screen-probe.map')
      return shellMarkup()
    })
    expect(html).toContain('data-screen-id="screen-probe.map"')
    expect(html).toContain('data-testid="screen-probe-map"')
  })

  it('keeps the higher-priority screen open when a lower one asks', () => {
    withRegistrations([PROBE_SLICE], () => {
      game().openScreen('screen-probe.alarm')
      game().openScreen('screen-probe.map')
      expect(openScreenId()).toBe('screen-probe.alarm')
    })
  })

  it('lets a higher-priority screen replace a lower one', () => {
    withRegistrations([PROBE_SLICE], () => {
      game().openScreen('screen-probe.map')
      game().openScreen('screen-probe.alarm')
      expect(openScreenId()).toBe('screen-probe.alarm')
    })
  })

  it('dismisses the screen on Back, and Back then reaches the layer under it', () => {
    withRegistrations([PROBE_SLICE], () => {
      game().openScreen('screen-probe.map')
      tapBack()
      expect(openScreenId()).toBeNull()
      tapBack()
      expect(game().isSettingsOpen).toBe(false)
    })
  })

  it("dismisses the screen from its own back button, the shell's onDismiss", () => {
    withRegistrations([PROBE_SLICE], () => {
      game().openScreen('screen-probe.map')
      game().dismissScreen()
      expect(openScreenId()).toBeNull()
    })
  })

  it('refuses a screen id no slice registered and leaves the open one', () => {
    withRegistrations([PROBE_SLICE], () => {
      game().openScreen('screen-probe.map')
      expect(() => game().openScreen('screen-probe.none')).toThrow(/no slice registered/)
      expect(openScreenId()).toBe('screen-probe.map')
    })
  })

  it('submits no command: opening and dismissing leave the session tick and digest alone', () => {
    const before = takeSessionSnapshot()
    withRegistrations([PROBE_SLICE], () => {
      game().openScreen('screen-probe.map')
      tapBack()
    })
    const after = takeSessionSnapshot()
    expect({ tick: after.tick, digest: after.digest }).toEqual({
      tick: before.tick,
      digest: before.digest,
    })
  })
})
