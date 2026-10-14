/**
 * What each aetheric pair combo shows and sounds when it fires (ticket 373; the G&V rule in the
 * #206 combo lock: one visible cue on the vehicle and one audible cue on the same tick). Both are
 * keyed to the combo's own `aetheric.*` event, so the flash (`vehicleLooks`, a glow on the parent
 * part's slots in the tech-tree's gear rows) and the tone (a slice `soundCue`) start on the tick
 * the event carries. Pure presentation: nothing here enters the authority state or a digest.
 *
 * - Still foam: the escapement glows clockface brass, with an escapement tick.
 * - Warning chime: the periscope head flashes and the whistle puffs, with a two-tone chime.
 * - Pendulum anchor: the escapement cage swings out in brass, with a low clock chime.
 * - Quench cutters: steam white on the flank cutters and the condenser, with a quench hiss.
 *
 * Every number is tuned by eye and ear: the colours are the icons' brass, aether blue and steam,
 * the tones placeholder synths (#13), and the flash half a second at 60 ticks a second.
 */
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import type { SoundCue } from '../../../../systems/registries/soundCues'
import type {
  VehicleLook,
  VehicleLookFlash,
  VehicleLookSource,
} from '../../../../systems/registries/vehicleLooks'

const BRASS = '#c9a24a'
const AETHER_BLUE = '#7ab0d9'
const STEAM_WHITE = '#e8eef2'
/** Half a second of glow. */
export const COMBO_FLASH_TICKS = 30
const FLASH_GLOW = 3 / 2

/** The combo events that fire a cue. */
export type ComboEventType =
  | 'aetheric.FoamStilled'
  | 'aetheric.WarningChimed'
  | 'aetheric.PendulumSwung'
  | 'aetheric.CuttersQuenched'

interface ComboCue {
  cueId: string
  look: VehicleLook
}

function glowOn(slots: readonly string[], colour: string): VehicleLook {
  return { tint: null, opacity: 1, outline: null, glows: [{ slots, colour, glow: FLASH_GLOW }] }
}

const COMBO_CUES: Readonly<Record<ComboEventType, ComboCue>> = {
  'aetheric.FoamStilled': {
    cueId: 'aetheric.combo.still_foam',
    look: glowOn(['escapement-wheel'], BRASS),
  },
  'aetheric.WarningChimed': {
    cueId: 'aetheric.combo.warning_chime',
    look: glowOn(['periscope-head', 'whistle-body'], AETHER_BLUE),
  },
  'aetheric.PendulumSwung': {
    cueId: 'aetheric.combo.pendulum_anchor',
    look: glowOn(['escapement-cage', 'escapement-wheel'], BRASS),
  },
  'aetheric.CuttersQuenched': {
    cueId: 'aetheric.combo.quench_cutters',
    look: glowOn(['cutter-arm', 'condenser-tank'], STEAM_WHITE),
  },
}

/** The combo look as the kernel asks for it: no lasting look, a flash on each combo event. */
export function createComboLook(): VehicleLookSource {
  return {
    id: 'aetheric.combo-cues',
    lookOf: () => null,
    flashOf: comboFlashOf,
  }
}

/** The flash a combo event plays on its player's vehicle; null for any other event. */
export function comboFlashOf(event: DomainEvent): VehicleLookFlash | null {
  const cue = comboCueOf(event)
  if (cue === null) return null
  return { ticks: COMBO_FLASH_TICKS, lookAt: () => cue.look }
}

/** The sound cue a combo event plays; null for any other event. */
export function comboSoundCueIdOf(event: DomainEvent): string | null {
  return comboCueOf(event)?.cueId ?? null
}

function comboCueOf(event: DomainEvent): ComboCue | null {
  return Object.hasOwn(COMBO_CUES, event.type) ? COMBO_CUES[event.type as ComboEventType] : null
}

/** The four tones, one voice each: a combo fires at most once a cooldown. */
export const COMBO_SOUND_CUES: readonly SoundCue[] = [
  {
    id: 'aetheric.combo.still_foam',
    voices: 1,
    tone: {
      partials: [{ wave: 'square', frequency: 1760, gain: 1 / 8 }],
      noise: { frequency: 3200, q: 8, gain: 1 / 5 },
      seconds: 3 / 20,
    },
  },
  {
    id: 'aetheric.combo.warning_chime',
    voices: 1,
    tone: {
      partials: [
        { wave: 'sine', frequency: 988, gain: 1 / 3 },
        { wave: 'sine', frequency: 740, gain: 1 / 3 },
      ],
      noise: null,
      seconds: 3 / 5,
    },
  },
  {
    id: 'aetheric.combo.pendulum_anchor',
    voices: 1,
    tone: {
      partials: [
        { wave: 'triangle', frequency: 392, gain: 2 / 5 },
        { wave: 'sine', frequency: 784, gain: 1 / 6 },
      ],
      noise: null,
      seconds: 1,
    },
  },
  {
    id: 'aetheric.combo.quench_cutters',
    voices: 1,
    tone: { partials: [], noise: { frequency: 5200, q: 1, gain: 1 / 3 }, seconds: 1 / 2 },
  },
]
