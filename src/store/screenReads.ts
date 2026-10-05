/**
 * The screens' view models now (#33), for the DOM components and the debug API's `ui.*` reads:
 * the same functions on the same store, so a spec reads what the screen draws. The audio model
 * (#49) is read the same way by the sound stage.
 */
import { selectAudioModel, type AudioModel } from '../systems/audio/audioModel'
import { musicMomentOf } from '../systems/audio/musicMoment'
import type { MusicMoment } from '../systems/audio/musicLayers'
import type { HudModel } from '../systems/views/hudModel'
import type { PlaqueModel } from '../systems/views/plaqueModel'
import type { PlatformModel } from '../systems/views/platformModel'
import type { SettingsModel } from '../systems/views/settingsModel'
import { readAuthorityState } from './authorityLink'
import { useGameStore } from './gameStore'
import { readPlayedStingers } from './musicStingerRecord'
import { hudModelOf, plaqueModelOf, platformModelOf, settingsModelOf } from './screenModels'

export function readHudModel(): HudModel {
  return hudModelOf(useGameStore.getState())
}

export function readPlatformModel(): PlatformModel {
  return platformModelOf(useGameStore.getState())
}

export function readSettingsModel(): SettingsModel {
  return settingsModelOf(useGameStore.getState())
}

/** The hint and transmission plaques (#16) as they are drawn. */
export function readPlaqueModel(): PlaqueModel {
  return plaqueModelOf(useGameStore.getState())
}

/** Where the music stands now (#49), from the authority replica and the client-owned depth. */
export function readMusicMoment(): MusicMoment {
  const { playerId, depthTiles } = useGameStore.getState()
  return musicMomentOf(readAuthorityState(), playerId, depthTiles)
}

/** The music's layer targets, settings and stingers now, as the sound stage plays them (#49). */
export function readAudioModel(): AudioModel {
  return selectAudioModel(readMusicMoment(), useGameStore.getState().prefs, readPlayedStingers())
}
