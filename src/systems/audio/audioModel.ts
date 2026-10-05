/**
 * The audio view model (#49 acceptance): what the music plays now, as data, so the debug API and
 * specs check the music without a sound card. The sound stage reads the same model, so what a spec
 * asserts is what plays.
 */
import type { DrillVoice } from './drillVoice'
import type { StingerId } from './musicBook'
import {
  musicBusGainOf,
  musicTargetsOf,
  type MusicLayers,
  type MusicMoment,
  type MusicSettings,
} from './musicLayers'

export interface AudioModel {
  /** Each layer's target now; the crossfade eases toward it. */
  layers: MusicLayers
  /** The run's stingers so far, in the order they played. */
  stingers: StingerId[]
  musicVolume: number
  musicMuted: boolean
  /** The music bus level: the volume, silent when muted, ducked while the artefact choice is open. */
  busGain: number
  /** `casing` while the drill's nose is in lining (#41 feel: "sfx: casing_drill"), else `rock`. */
  drillVoice: DrillVoice
}

export function selectAudioModel(
  moment: MusicMoment,
  settings: MusicSettings,
  stingers: readonly StingerId[],
  drillVoice: DrillVoice,
): AudioModel {
  return {
    layers: musicTargetsOf(moment),
    stingers: [...stingers],
    musicVolume: settings.musicVolume,
    musicMuted: settings.musicMuted,
    busGain: musicBusGainOf(settings, moment.isArtefactChoiceOpen),
    drillVoice,
  }
}
