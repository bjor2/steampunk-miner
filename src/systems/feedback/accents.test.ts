import { describe, expect, it } from 'vitest'
import { ACCENT_OF_CUE } from './accents'
import { SHIPPED_CHARGE_BLAST_KICK } from '../registries/chargeBlastCue'
import type { FeedbackCue } from './feedbackCues'
import { createScreenEffects, kickScreen } from './screenEffects'

const CUES: FeedbackCue[] = [
  { kind: 'pickup', tier: 3 },
  { kind: 'dockClank' },
  { kind: 'upgradeClank' },
  { kind: 'hit' },
  { kind: 'destroyed' },
  { kind: 'coreStinger' },
  { kind: 'travelStinger' },
  { kind: 'casingHiss' },
  { kind: 'casingPop' },
  { kind: 'collapseRumble' },
  { kind: 'collapseCrash' },
  { kind: 'wreckerScrape' },
  { kind: 'chargeBlast', kick: SHIPPED_CHARGE_BLAST_KICK },
  { kind: 'drillContact' },
  { kind: 'holdCancelled' },
  { kind: 'holdFinished' },
]

describe('accents', () => {
  it('gives every feedback cue exactly one slot: one accent or none (#48 acceptance 3)', () => {
    expect(Object.keys(ACCENT_OF_CUE).sort()).toEqual(CUES.map((cue) => cue.kind).sort())
  })

  it.each(CUES)('flashes the screen on $kind only when the bloom flash is its accent', (cue) => {
    const effects = createScreenEffects()
    kickScreen(effects, cue, { shake: true, flashes: true })
    expect(effects.flash > 0).toBe(ACCENT_OF_CUE[cue.kind] === 'bloomFlash')
  })
})
