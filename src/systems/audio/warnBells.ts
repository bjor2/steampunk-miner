/**
 * The warning ladder's bells (spec #678, ticket 685; docs/ui/design-system.md section 8): the
 * kernel's `ui.warn.low`, `ui.warn.critical` and `ui.warn.empty` cues, one voice each and ringing
 * as long as the token's `maxMs`, read from `designTokens.json` so the voices and the length stay
 * data. A bell ducks 6 dB under the drill's voice, as the music ducks (#49), so it never masks
 * the cut it warns about. Presentation only.
 */
import {
  WARN_BELL_GAIN,
  WARN_BELL_HZ,
  WARN_BELL_OCTAVE_GAIN,
  WARN_BELL_TIERCE_GAIN,
  WARN_BELL_TIERCE_RATIO,
} from '../../constants/audio'
import type { CueTone, SoundCue } from '../registries/soundCues'
import { DESIGN_TOKENS, type DesignTokens } from '../views/designSystem'
import { DUCKED_SHARE } from './musicLayers'

type BellTier = keyof typeof WARN_BELL_HZ

const BELL_TIERS: readonly BellTier[] = ['low', 'critical', 'empty']
const WARN_CUE_PREFIX = 'ui.warn.'
const MS_PER_SECOND = 1000
const OCTAVE = 2

/** The bells as cues, in ladder order; a tier the tokens list no cue for has no bell. */
export function warnBellCuesOf(tokens: DesignTokens = DESIGN_TOKENS): SoundCue[] {
  return BELL_TIERS.flatMap((tier) => {
    const token = tokens.soundCues.find((cue) => cue.id === `${WARN_CUE_PREFIX}${tier}`)
    if (token === undefined) return []
    return [{ id: token.id, voices: token.voices, tone: bellToneOf(tier, token.maxMs) }]
  })
}

export const WARN_BELL_CUES: readonly SoundCue[] = warnBellCuesOf()

/** The bell's level: its own while the drill is quiet, ducked under it while it cuts. */
export function warnBellGainOf(isDrilling: boolean): number {
  return isDrilling ? DUCKED_SHARE : 1
}

function bellToneOf(tier: BellTier, maxMs: number): CueTone {
  const hz = WARN_BELL_HZ[tier]
  return {
    partials: [
      { wave: 'sine', frequency: hz, gain: WARN_BELL_GAIN },
      { wave: 'sine', frequency: hz * WARN_BELL_TIERCE_RATIO, gain: WARN_BELL_TIERCE_GAIN },
      { wave: 'sine', frequency: hz * OCTAVE, gain: WARN_BELL_OCTAVE_GAIN },
    ],
    noise: null,
    seconds: maxMs / MS_PER_SECOND,
  }
}
