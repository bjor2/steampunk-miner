import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { soundCueById, soundCueProblems } from '../../../../systems/registries/soundCues'
import { vehicleLookSources } from '../../../../systems/registries/vehicleLooks'
import {
  COMBO_FLASH_TICKS,
  COMBO_SOUND_CUES,
  comboFlashOf,
  comboSoundCueIdOf,
  type ComboEventType,
} from './comboCues'

// The aetheric pair combos' cues (ticket 373; the G&V rule in the #206 combo lock): each combo
// event plays one flash on the vehicle and one tone, both from the same event, so they start on
// the same tick; any other event plays neither.

const COMBO_EVENTS: readonly DomainEvent[] = [
  { tick: 7, type: 'aetheric.FoamStilled', playerId: 'p1', itemId: 'x', blocks: 1, lastTick: 9 },
  {
    tick: 7,
    type: 'aetheric.WarningChimed',
    playerId: 'p1',
    itemId: 'x',
    enemyId: 'e1',
    tx: 1,
    ty: 2,
  },
  { tick: 7, type: 'aetheric.PendulumSwung', playerId: 'p1', itemId: 'x', tx: 1, ty: 2 },
  { tick: 7, type: 'aetheric.CuttersQuenched', playerId: 'p1', itemId: 'x', heat: 8, energy: 2 },
]

const typeOf = (event: DomainEvent) => event.type as ComboEventType

describe('aetheric combo cues', () => {
  it('gives every combo event one flash and one registered tone', () => {
    COMBO_EVENTS.forEach((event) => {
      const flash = comboFlashOf(event)
      expect(flash?.ticks, typeOf(event)).toBe(COMBO_FLASH_TICKS)
      expect(flash?.lookAt(0)?.glows.length, typeOf(event)).toBeGreaterThan(0)
      const cueId = comboSoundCueIdOf(event)
      expect(cueId, typeOf(event)).not.toBeNull()
      expect(soundCueById(cueId as string), typeOf(event)).not.toBeNull()
    })
  })

  it('gives each combo its own tone', () => {
    const cueIds = COMBO_EVENTS.map(comboSoundCueIdOf)
    expect(new Set(cueIds).size).toBe(COMBO_EVENTS.length)
  })

  it('plays nothing for the parent items’ own events', () => {
    const sounded: DomainEvent = {
      tick: 7,
      type: 'aetheric.WhistleSounded',
      playerId: 'p1',
      itemId: 'power.resonance_whistle',
      tx: 1,
      ty: 2,
      reachTiles: 8,
      durationTicks: 300,
      energy: 240,
    }
    expect(comboFlashOf(sounded)).toBeNull()
    expect(comboSoundCueIdOf(sounded)).toBeNull()
  })

  it('registers its tones within the cue rules and its flash on the kernel look seam', () => {
    COMBO_SOUND_CUES.forEach((cue) => expect(soundCueProblems(cue), cue.id).toEqual([]))
    expect(vehicleLookSources().map((source) => source.id)).toContain('aetheric.combo-cues')
  })
})
