import { describe, expect, it } from 'vitest'
import { combatStatusStackOf } from './combatStatuses'
import type { HudModel } from './hudModel'
import { hudStagingProblemsOf, NO_HUD_STAGING, stagedHudModelOf } from './hudStaging'

const QUIET = {
  cargo: { isFull: false },
  threats: [],
  statuses: { shown: [], hiddenCount: 0, secondary: [] },
} as unknown as HudModel

describe('HUD debug staging (#500)', () => {
  it('hands the model back untouched with nothing staged', () => {
    expect(stagedHudModelOf(QUIET, NO_HUD_STAGING)).toBe(QUIET)
  })

  it('fills the hold and adds the cargo-full status once', () => {
    const staged = stagedHudModelOf(QUIET, { isCargoFull: true, threatOctant: null })
    expect(staged.cargo.isFull).toBe(true)
    expect(staged.statuses.secondary.map((status) => status.id)).toEqual(['cargo_full'])
    const again = stagedHudModelOf(staged, { isCargoFull: true, threatOctant: null })
    expect(again.statuses.secondary).toHaveLength(1)
  })

  it('adds a threat marker and its status, folded into the count past three', () => {
    const staged = stagedHudModelOf(QUIET, { isCargoFull: false, threatOctant: 6 })
    expect(staged.threats.map((threat) => threat.octant)).toEqual([6])
    expect(staged.statuses.shown.map((status) => status.id)).toEqual(['threat'])
    const crowded = combatStatusStackOf({
      hullPermille: 0,
      isCollapseWarned: true,
      chargeFuse: { ticksLeft: 30, isInsideBlast: true, text: 'CHARGE LIT 0.5 s: back off' },
      heat: null,
      warning: { level: 'ok', text: '', icon: '' } as HudModel['warning'],
      threats: [],
      cargo: { isFull: false } as HudModel['cargo'],
      vehicleState: { rescueCountdownText: '' } as HudModel['vehicleState'],
    })
    const folded = stagedHudModelOf(
      { ...QUIET, statuses: crowded },
      { isCargoFull: false, threatOctant: 0 },
    )
    expect(folded.statuses.shown).toHaveLength(3)
    expect(folded.statuses.hiddenCount).toBe(1)
  })

  it('names every problem of a staging that is not one', () => {
    expect(hudStagingProblemsOf(null)).toEqual(['staging must be an object'])
    expect(hudStagingProblemsOf({ isCargoFull: true, threatOctant: 1.5 })).toEqual([
      'threatOctant must be null or a whole 0 to 7',
    ])
    expect(hudStagingProblemsOf({ isCargoFull: false, threatOctant: null })).toEqual([])
  })
})
