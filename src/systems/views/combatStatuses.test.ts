import { describe, expect, it } from 'vitest'
import { forceCollapseCommand } from '../authority/collapse/collapseCommands'
import { BAND_1_Y, digAlong, prepareDigger } from '../authority/collapse/collapseFixtures'
import { createScriptedSession } from '../authority/scriptedSession'
import { setHullCommand } from '../vehicle/vehicleCommands'
import { ACTION_MAP, defaultBindings } from '../input/actionMap'
import { blockContaining, blockIdOf } from '../world/collapseBlock'
import {
  combatStatusStackOf,
  HULL_CRITICAL_PERCENT,
  isCollapseWarnedFor,
  MOST_STATUSES_SHOWN,
  type CombatStatusSources,
} from './combatStatuses'
import { selectHudModel } from './hudModel'

const BINDINGS = defaultBindings(ACTION_MAP)

/** Nothing wrong: full hull, no collapse, no fuse, no heat, energy fine, no threats. */
const CALM: CombatStatusSources = {
  hullPermille: 1000,
  isCollapseWarned: false,
  chargeFuse: null,
  heat: null,
  warning: { level: 'ok', text: '', icon: '', returnReserveUnits: 0 },
  threats: [],
  cargo: {
    text: '0 / 10',
    exact: '0',
    permille: 0,
    iconId: 'icon-gauge-cargo',
    coreFragments: 0,
    coreText: '',
    isFull: false,
  },
  vehicleState: {
    mode: 'active',
    text: 'UNDER WAY',
    icon: 'icon-state-active',
    rescueCountdownTicks: null,
    rescueCountdownText: '',
  },
}

const threat = (phase: 'windup' | 'lunge') => ({
  kind: 'crawler' as const,
  iconId: 'icon-enemy-crawler',
  phase,
  octant: 2,
  arc: 'F' as const,
  ticksLeft: 10,
  isTremor: false,
})

/** Every one of the six on at once. */
const EVERYTHING: CombatStatusSources = {
  ...CALM,
  hullPermille: HULL_CRITICAL_PERCENT * 10,
  isCollapseWarned: true,
  chargeFuse: { ticksLeft: 60, isInsideBlast: true, text: 'CHARGE LIT 1.0 s: back off' },
  heat: {
    text: '90 / 100',
    exact: '90',
    permille: 900,
    iconId: 'icon-heat-lava',
    isThrottled: true,
    throttledText: 'THROTTLED',
  },
  warning: {
    level: 'low',
    text: 'LOW ENERGY',
    icon: 'icon-status-low-energy',
    returnReserveUnits: 3,
  },
  threats: [threat('windup')],
}

describe('combat status stack (#158)', () => {
  it('shows nothing while nothing is wrong', () => {
    expect(combatStatusStackOf(CALM)).toEqual({ shown: [], hiddenCount: 0, secondary: [] })
  })

  it('orders the six by priority and folds the rest into a +N count', () => {
    const stack = combatStatusStackOf(EVERYTHING)
    expect(stack.shown.map((status) => status.id)).toEqual(['hull_critical', 'collapse', 'fuse'])
    expect(stack.shown).toHaveLength(MOST_STATUSES_SHOWN)
    expect(stack.hiddenCount).toBe(3)
  })

  it('gives every status its triangle icon and says its urgency as a pulse rate', () => {
    const stack = combatStatusStackOf({
      ...EVERYTHING,
      hullPermille: 1000,
      isCollapseWarned: false,
    })
    expect(stack.shown.map((status) => [status.id, status.iconId, status.urgency])).toEqual([
      ['fuse', 'icon-status-fuse', 'fast'],
      ['overheat', 'icon-status-overheat', 'slow'],
      ['low_energy', 'icon-status-low-energy', 'slow'],
    ])
    expect(stack.hiddenCount).toBe(1)
  })

  it('pulses the threat fast once a lunge lands and the energy fast once critical', () => {
    const landing = combatStatusStackOf({ ...CALM, threats: [threat('lunge'), threat('windup')] })
    expect(landing.shown).toEqual([
      { id: 'threat', iconId: 'icon-status-threat', text: 'THREATS x2', urgency: 'fast' },
    ])
    const critical = combatStatusStackOf({
      ...CALM,
      warning: { ...EVERYTHING.warning, level: 'critical', text: 'CRITICAL ENERGY' },
    })
    expect(critical.shown[0]).toMatchObject({ id: 'low_energy', urgency: 'fast' })
  })

  it('calls the hull critical at the hud.json percent and not one thousandth above it', () => {
    const at = combatStatusStackOf({ ...CALM, hullPermille: HULL_CRITICAL_PERCENT * 10 })
    const above = combatStatusStackOf({ ...CALM, hullPermille: HULL_CRITICAL_PERCENT * 10 + 1 })
    expect(at.shown.map((status) => status.id)).toEqual(['hull_critical'])
    expect(above.shown).toEqual([])
  })

  it('lists cargo full and the tow countdown as secondary statuses', () => {
    const stack = combatStatusStackOf({
      ...CALM,
      cargo: { ...CALM.cargo, isFull: true },
      vehicleState: {
        ...CALM.vehicleState,
        mode: 'stranded',
        rescueCountdownTicks: 120,
        rescueCountdownText: 'tow in 2 s',
      },
    })
    expect(stack.secondary).toEqual([
      { id: 'cargo_full', iconId: 'icon-status-cargo-full', text: 'CARGO FULL' },
      { id: 'tow', iconId: 'icon-status-tow', text: 'tow in 2 s' },
    ])
  })
})

describe('combat statuses on the HUD model', () => {
  const hudOf = (session: ReturnType<typeof createScriptedSession>) =>
    selectHudModel({ state: session.state(), playerId: 'p1', depthTiles: 0, bindings: BINDINGS })

  it('warns of a collapse while a block near the vehicle is telegraphing, and not after', () => {
    const session = createScriptedSession()
    prepareDigger(session, 0)
    const dug = digAlong(session, 0, BAND_1_Y, 20500, 30500)
    const back = digAlong(session, dug, BAND_1_Y, 30500, 26500, 0)
    expect(isCollapseWarnedFor(session.state(), 'p1')).toBe(false)
    session.submit(
      back,
      forceCollapseCommand(blockIdOf(blockContaining({ xMm: 26500, yMm: BAND_1_Y }))),
    )
    expect(isCollapseWarnedFor(session.state(), 'p1')).toBe(true)
    expect(hudOf(session).statuses.shown.map((status) => status.id)).toEqual(['collapse'])
    session.advanceTo(back + 61)
    expect(isCollapseWarnedFor(session.state(), 'p1')).toBe(false)
  })

  it('raises hull critical from the hull gauge', () => {
    const session = createScriptedSession()
    session.submit(0, setHullCommand('1'))
    expect(hudOf(session).statuses.shown.map((status) => status.id)).toEqual(['hull_critical'])
  })
})
