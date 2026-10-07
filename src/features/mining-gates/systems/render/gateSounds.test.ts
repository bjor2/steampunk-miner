import { describe, expect, it } from 'vitest'
import { soundCueById, soundCueProblems } from '../../../../systems/registries/soundCues'
import type { GateHitAt } from '../gateChipBoard'
import { cueOfGateHit, GATE_SOUNDS, gateSoundPlanOf, QUIET_GATE_SOUND_MEMORY } from './gateSounds'

// A distinct sound per gate kind at contact (ticket 238; #142 "At contact"; GD on #151).

function hitAt(tx: number, tick: number, words: Partial<GateHitAt> = {}): GateHitAt {
  return {
    gateKind: 'drill',
    outcome: 'refused',
    required: 'tip:30',
    have: 'tip:28',
    tx,
    ty: -60,
    tick,
    ...words,
  }
}

const cueOf = (words: Partial<GateHitAt>) => cueOfGateHit(hitAt(0, 0, words))

describe('gate sounds', () => {
  it('clanks on a drill gate and knocks on a dynamite shell', () => {
    expect(cueOf({ gateKind: 'drill' })).toBe('mining-gates.clank')
    expect(cueOf({ gateKind: 'dynamite', required: 'size:2', have: 'size:0' })).toBe(
      'mining-gates.shell-knock',
    )
  })

  it('plays each refusing extractor its own deflection tone', () => {
    const refusedBy = (rigId: string) => cueOf({ gateKind: 'rig', required: rigId, have: 'none' })
    expect(refusedBy('rig.resonance')).toBe('mining-gates.fork-ring')
    expect(refusedBy('rig.induction')).toBe('mining-gates.coil-thunk')
    expect(refusedBy('rig.acid_etcher')).toBe('mining-gates.etch-scrape')
  })

  it('hisses a vented cell and drifts a lump that floats off', () => {
    const lostBy = (rigId: string) =>
      cueOf({ gateKind: 'rig', outcome: 'lost', required: rigId, have: 'none' })
    expect(lostBy('rig.containment')).toBe('mining-gates.vent-hiss')
    expect(lostBy('rig.aether_tether')).toBe('mining-gates.lump-drift')
  })

  it('keeps a held drill on one cell quiet until the repeat time has passed', () => {
    const first = gateSoundPlanOf([hitAt(3, 100)], false, QUIET_GATE_SOUND_MEMORY)
    const held = gateSoundPlanOf([hitAt(3, 110)], false, first.memory)
    const later = gateSoundPlanOf([hitAt(3, 100 + GATE_SOUNDS.repeatTicks)], false, first.memory)
    expect([first.cueIds, held.cueIds, later.cueIds]).toEqual([
      ['mining-gates.clank'],
      [],
      ['mining-gates.clank'],
    ])
  })

  it('sounds a different cell at once', () => {
    const first = gateSoundPlanOf([hitAt(3, 100)], false, QUIET_GATE_SOUND_MEMORY)
    expect(gateSoundPlanOf([hitAt(4, 101)], false, first.memory).cueIds).toEqual([
      'mining-gates.clank',
    ])
  })

  it('plays one flourish for a batch that freed gated cells', () => {
    expect(gateSoundPlanOf([], true, QUIET_GATE_SOUND_MEMORY).cueIds).toEqual([
      'mining-gates.cleared',
    ])
  })

  it('registers every cue it plays, each playable under the kernel cue rules', () => {
    const played = [
      GATE_SOUNDS.drillCue,
      GATE_SOUNDS.dynamiteCue,
      GATE_SOUNDS.clearedCue,
      ...Object.values(GATE_SOUNDS.extractorCues),
      ...Object.values(GATE_SOUNDS.lostCues),
    ]
    expect(played.filter((cueId) => soundCueById(cueId) === null)).toEqual([])
    expect(GATE_SOUNDS.cues.flatMap(soundCueProblems)).toEqual([])
  })
})
