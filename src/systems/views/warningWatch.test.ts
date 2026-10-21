import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { KEYBOARD_PROMPTS } from '../input/promptFixtures'
import { setHullCommand } from '../vehicle/vehicleCommands'
import { combatStatusStackOf } from './combatStatuses'
import { selectHudModel, type HudModel } from './hudModel'
import { hudStripOf } from './hudStrip'
import {
  ARMED_WARNING_WATCH,
  edgeGlowOf,
  stepWarningWatch,
  warningReadingsOf,
  type WarningFiring,
  type WarningReading,
  type WarningReadoutId,
  type WarningWatch,
} from './warningWatch'

const reading = (id: WarningReadoutId, percent: number): WarningReading => ({
  id,
  leftPermille: percent * 10,
})

/** Feeds the watch one reading of `id` after another, collecting every firing. */
function walk(id: WarningReadoutId, percents: readonly number[]) {
  let watch: WarningWatch = ARMED_WARNING_WATCH
  const firings: WarningFiring[] = []
  for (const percent of percents) {
    const step = stepWarningWatch(watch, [reading(id, percent)])
    watch = step.watch
    firings.push(...step.firings)
  }
  return { watch, firings, tiers: firings.map((firing) => firing.tier) }
}

describe('warning ladder firing (ticket 685)', () => {
  it('fires each tier once on the way down: low at 30%, critical at 15%, empty at 0%', () => {
    expect(walk('fuel', [100, 31, 30, 25, 16, 15, 10, 1, 0]).tiers).toEqual([
      'low',
      'critical',
      'empty',
    ])
  })

  it('stays quiet while a reading hovers inside a tier it already fired', () => {
    expect(walk('hull', [29, 28, 30, 33, 29, 34, 27]).tiers).toEqual(['low'])
  })

  it('re-arms a tier only once the reading climbs 5% above it', () => {
    expect(walk('hull', [29, 35, 29]).tiers).toEqual(['low'])
    expect(walk('hull', [29, 36, 29]).tiers).toEqual(['low', 'low'])
    expect(walk('fuel', [14, 20, 14, 21, 14]).tiers).toEqual(['critical', 'critical'])
  })

  it('keeps the shallower tier fired while only the deeper one re-arms', () => {
    const { watch, tiers } = walk('fuel', [14, 21, 25, 14])
    expect(tiers).toEqual(['critical', 'critical'])
    expect(walk('fuel', [14, 21]).watch.fuel).toBe('low')
    expect(watch.fuel).toBe('critical')
  })

  it('rings the deepest tier alone when a reading falls past several at once', () => {
    expect(walk('cargo', [100, 0]).tiers).toEqual(['empty'])
    expect(walk('cargo', [100, 0, 3]).tiers).toEqual(['empty'])
  })

  it('names the tier bell and its haptic pulse from the tokens', () => {
    const { firings } = walk('hull', [30, 15, 0])
    expect(firings.map((firing) => [firing.cueId, firing.hapticMs])).toEqual([
      ['ui.warn.low', 10],
      ['ui.warn.critical', 30],
      ['ui.warn.empty', 60],
    ])
    expect(firings.every((firing) => firing.readoutId === 'hull')).toBe(true)
  })

  it('watches each readout apart, so one falling never silences another', () => {
    const first = stepWarningWatch(ARMED_WARNING_WATCH, [reading('hull', 20), reading('fuel', 90)])
    const second = stepWarningWatch(first.watch, [reading('hull', 20), reading('fuel', 12)])
    expect(first.firings.map((firing) => firing.readoutId)).toEqual(['hull'])
    expect(second.firings.map((firing) => [firing.readoutId, firing.tier])).toEqual([
      ['fuel', 'critical'],
    ])
  })

  it('fires the same tiers at every refresh rate: a reading read twice changes nothing', () => {
    const once = walk('heat', [50, 28, 12, 0])
    const twice = walk('heat', [50, 50, 28, 28, 12, 12, 0, 0])
    expect(twice.tiers).toEqual(once.tiers)
    expect(twice.watch).toEqual(once.watch)
  })
})

describe('edge glow (ticket 685)', () => {
  it('shows nothing while every reading is above the ladder', () => {
    expect(edgeGlowOf([reading('hull', 90), reading('fuel', 31)])).toEqual({
      tier: 'ok',
      readoutId: null,
    })
  })

  it('holds the deepest tier any reading stands in, the first readout winning a tie', () => {
    expect(edgeGlowOf([reading('hull', 25), reading('fuel', 10), reading('cargo', 12)])).toEqual({
      tier: 'critical',
      readoutId: 'fuel',
    })
  })

  it('follows the reading back out of a tier at once, while the bell waits to re-arm', () => {
    const fired = stepWarningWatch(ARMED_WARNING_WATCH, [reading('hull', 29)])
    const climbed = stepWarningWatch(fired.watch, [reading('hull', 32)])
    expect(climbed.glow.tier).toBe('ok')
    expect(climbed.watch.hull).toBe('low')
  })
})

type Session = ReturnType<typeof createScriptedSession>

function hudOf(session: Session): HudModel {
  return selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles: 3,
    prompts: KEYBOARD_PROMPTS,
  })
}

const leftOf = (readings: readonly WarningReading[], id: WarningReadoutId) =>
  readings.find((each) => each.id === id)?.leftPermille

describe('warning readings from the HUD (ticket 685)', () => {
  it('reads hull and fuel left, cargo room and heat room off the strip', () => {
    const session = createScriptedSession()
    session.submit(0, setHullCommand('20'))
    const model = hudOf(session)
    const readings = warningReadingsOf(hudStripOf(model), model.statuses)
    expect(readings.map((each) => each.id)).toEqual(['hull', 'fuel', 'cargo', 'heat', 'collapse'])
    expect(leftOf(readings, 'hull')).toBe(model.hull.permille)
    expect(leftOf(readings, 'fuel')).toBe(1000)
    expect(leftOf(readings, 'cargo')).toBe(1000)
    expect(leftOf(readings, 'heat')).toBe(1000)
  })

  it('reads a hot drill as heat room to the limit', () => {
    const model = hudOf(createScriptedSession())
    const heat = { ...model.energy, permille: 900, isThrottled: false, throttledText: '' }
    const readings = warningReadingsOf(hudStripOf({ ...model, heat }), model.statuses)
    expect(leftOf(readings, 'heat')).toBe(100)
  })

  it('puts a telegraphing collapse at the critical line, and clear of the ladder otherwise', () => {
    const model = hudOf(createScriptedSession())
    const warned = combatStatusStackOf({
      hullPermille: 1000,
      isCollapseWarned: true,
      chargeFuse: null,
      heat: null,
      warning: { level: 'ok', text: '', icon: '', returnReserveUnits: 0 },
      threats: [],
      cargo: model.cargo,
      vehicleState: model.vehicleState,
    })
    const step = stepWarningWatch(ARMED_WARNING_WATCH, warningReadingsOf(hudStripOf(model), warned))
    expect(step.firings.map((firing) => [firing.readoutId, firing.tier])).toEqual([
      ['collapse', 'critical'],
    ])
    expect(step.glow).toEqual({ tier: 'critical', readoutId: 'collapse' })
    expect(leftOf(warningReadingsOf(hudStripOf(model), model.statuses), 'collapse')).toBe(1000)
  })
})
