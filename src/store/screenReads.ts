/**
 * The screens' view models now (#33, #37), for the DOM components and the debug API's `ui.*` reads:
 * the same functions on the same store, so a spec reads what the screen draws. The audio model
 * (#49) is read the same way by the sound stage, and the touch cluster's situation (#173) too.
 */
import { selectAudioModel, type AudioModel } from '../systems/audio/audioModel'
import { drillVoiceOf, type DrillVoice } from '../systems/audio/drillVoice'
import { musicMomentOf } from '../systems/audio/musicMoment'
import type { MusicMoment } from '../systems/audio/musicLayers'
import type { HudModel } from '../systems/views/hudModel'
import type { PlaqueModel } from '../systems/views/plaqueModel'
import type { SellBayModel } from '../systems/views/sellBayModel'
import type { UpgradeBayModel } from '../systems/views/upgradeBayModel'
import type { RefineryBayModel } from '../systems/views/refineryBayModel'
import type { SettingsModel } from '../systems/views/settingsModel'
import { dockedBayOf } from '../systems/authority/dockRules'
import { chargesOf } from '../systems/authority/charges/chargeRules'
import type { TouchSituation } from '../systems/input/touchControls'
import { mountedGunModeOf } from '../systems/vehicle/vehicleGun'
import type { BayId } from '../systems/world/dockBays'
import { shownBayScreenIdOf } from '../ui/registries/bayScreens'
import { readAuthorityState } from './authorityLink'
import { useGameStore } from './gameStore'
import type { ArtefactChoiceModel } from '../systems/views/artefactChoiceModel'
import { readPlayedStingers } from './musicStingerRecord'
import { inputLayerOf } from './presentationSlice'
import {
  artefactChoiceModelOf,
  bayScreenOf,
  hudModelOf,
  plaqueModelOf,
  refineryBayModelOf,
  sellBayModelOf,
  settingsModelOf,
  upgradeBayModelOf,
  type BayScreen,
} from './screenModels'

export function readHudModel(): HudModel {
  return hudModelOf(useGameStore.getState())
}

/** The screen of the bay the vehicle is docked at, or null (#37). */
export function readBayScreen(): BayScreen {
  return bayScreenOf(useGameStore.getState())
}

/** The bay the vehicle is docked at, or null (#37): what opens the bay screen's shutter. */
export function readDockedBay(): BayId | null {
  return dockedBayOf(readAuthorityState(), useGameStore.getState().playerId)
}

/** The slice screen the docked bay shows (`bayScreens`, #180), or null for the kernel's own. */
export function readShownSliceBayScreenId(): string | null {
  const bay = readDockedBay()
  return bay === null ? null : shownBayScreenIdOf(readAuthorityState(), bay)
}

/** The Sell bay's model, as it would draw now, docked there or not. */
export function readSellBayModel(): SellBayModel {
  return sellBayModelOf(useGameStore.getState())
}

/** The Upgrade bay's model, as it would draw now, docked there or not. */
export function readUpgradeBayModel(): UpgradeBayModel {
  return upgradeBayModelOf(useGameStore.getState())
}

/** The Refinery bay's model (#105), as it would draw now, docked there or not. */
export function readRefineryBayModel(): RefineryBayModel {
  return refineryBayModelOf(useGameStore.getState())
}

export function readSettingsModel(): SettingsModel {
  return settingsModelOf(useGameStore.getState())
}

/** The hint and transmission plaques (#16) as they are drawn. */
export function readPlaqueModel(): PlaqueModel {
  return plaqueModelOf(useGameStore.getState())
}

/** Where the music stands now (#49), from the authority replica and the client-owned depth. */
function readMusicMoment(): MusicMoment {
  const { playerId, depthTiles } = useGameStore.getState()
  return musicMomentOf(readAuthorityState(), playerId, depthTiles)
}

/** The music's layer targets, settings and stingers now, as the sound stage plays them (#49). */
export function readAudioModel(): AudioModel {
  const { prefs } = useGameStore.getState()
  return selectAudioModel(readMusicMoment(), prefs, readPlayedStingers(), readDrillVoice())
}

/** Whether the drill's nose is in lining now (#41 feel), for the drill loop and the sparks. */
export function readDrillVoice(): DrillVoice {
  return drillVoiceOf(readAuthorityState(), useGameStore.getState().playerId)
}

/** The artefact cache's three cards (#46) as they are drawn while open. */
export function readArtefactChoiceModel(): ArtefactChoiceModel {
  return artefactChoiceModelOf(useGameStore.getState())
}

/** What decides the touch cluster's buttons now (#173): the layer, the vehicle and its parts. */
export function readTouchSituation(): TouchSituation {
  const game = useGameStore.getState()
  const state = readAuthorityState()
  return {
    layer: inputLayerOf(game),
    vehicleMode: game.vehicle.mode,
    dockedBay: dockedBayOf(state, game.playerId),
    hasGuns: mountedGunModeOf(state.players[game.playerId].vehicle.gun) !== null,
    hasChargeRack: chargesOf(state, game.playerId).isRackMounted,
  }
}
