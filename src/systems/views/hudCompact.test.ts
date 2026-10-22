import { describe, expect, it } from 'vitest'
import { combatStatusStackOf, type CombatStatusSources } from './combatStatuses'
import {
  compactChipValueOf,
  compactStatusRowOf,
  isUprightCompactHud,
  statusIconsMaxOf,
} from './hudCompact'
import type { VehicleStateReading } from './hudReadings'

const UNDER_WAY: VehicleStateReading = {
  mode: 'active',
  text: 'UNDER WAY',
  icon: 'icon-state-active',
  rescueCountdownTicks: null,
  rescueCountdownText: '',
}

/** All six combat statuses at once, and the hold full. */
const CROWDED: CombatStatusSources = {
  hullPermille: 0,
  isCollapseWarned: true,
  chargeFuse: { ticksLeft: 30, isInsideBlast: true, text: 'CHARGE LIT 0.5 s: back off' },
  heat: {
    text: '90 / 100',
    exact: '90',
    permille: 900,
    iconId: 'icon-heat-lava',
    isThrottled: true,
    throttledText: 'THROTTLED',
  },
  warning: { level: 'low', text: 'LOW ENERGY', icon: '', returnReserveUnits: 3 },
  threats: [
    {
      kind: 'crawler',
      iconId: 'icon-enemy-crawler',
      phase: 'windup',
      octant: 2,
      arc: 'F',
      ticksLeft: 10,
      isTremor: false,
    },
  ],
  cargo: {
    text: '10 / 10',
    exact: '10',
    permille: 1000,
    iconId: 'icon-gauge-cargo',
    coreFragments: 0,
    coreText: '',
    isFull: true,
    chainLinks: 1,
  },
  vehicleState: UNDER_WAY,
}

const chipIdsOf = (chipsMax: number) =>
  compactStatusRowOf(combatStatusStackOf(CROWDED), UNDER_WAY, chipsMax).chips.map((chip) => chip.id)

describe('compact HUD rows (#486)', () => {
  it('lays threats and prompts out as rows only on the compact HUD held upright', () => {
    expect(isUprightCompactHud('compact', 'portrait')).toBe(true)
    expect(isUprightCompactHud('compact', 'landscape')).toBe(false)
    expect(isUprightCompactHud('full', 'portrait')).toBe(false)
    expect(isUprightCompactHud('full', 'landscape')).toBe(false)
  })

  it('keeps the numbers a chip title carries to draw beside its icon', () => {
    expect(compactChipValueOf('THREATS x2')).toBe('x2')
    expect(compactChipValueOf('CHARGE LIT 0.5s')).toBe('0.5s')
    expect(compactChipValueOf('tow in 10s')).toBe('10s')
  })

  it('draws no number for a title of words alone', () => {
    expect(compactChipValueOf('HULL CRITICAL')).toBe('')
    expect(compactChipValueOf('FULL')).toBe('')
  })
})

describe('strip status icons (ticket 685)', () => {
  it('has room for three icons on a phone and six on desktop', () => {
    expect(statusIconsMaxOf('compact')).toBe(3)
    expect(statusIconsMaxOf('full')).toBe(6)
  })

  it('shows the first three in priority order on a phone, the collapse among them', () => {
    expect(chipIdsOf(3)).toEqual(['hull_critical', 'collapse', 'fuse'])
    const row = compactStatusRowOf(combatStatusStackOf(CROWDED), UNDER_WAY, 3)
    expect(row.hiddenCount).toBe(4)
  })

  it('fills six on desktop in the same order, folding only the rest into the count', () => {
    expect(chipIdsOf(6)).toEqual([
      'hull_critical',
      'collapse',
      'fuse',
      'overheat',
      'low_energy',
      'threat',
    ])
    const row = compactStatusRowOf(combatStatusStackOf(CROWDED), UNDER_WAY, 6)
    expect(row.hiddenCount).toBe(1)
  })
})
