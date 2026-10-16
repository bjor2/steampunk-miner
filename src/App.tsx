import { GameScene } from './scene/GameScene'
import { ArtefactChoice } from './ui/artefact/ArtefactChoice'
import { EndOfSliceCard } from './ui/EndOfSliceCard'
import { Hud } from './ui/hud/Hud'
import { AboveBayLayer } from './ui/platform/AboveBayLayer'
import { PlanetCard } from './ui/planet/PlanetCard'
import { PlatformScreen } from './ui/platform/PlatformScreen'
import { Plaques } from './ui/plaques/Plaques'
import { PauseMenu } from './ui/pause/PauseMenu'
import { SettingsPanel } from './ui/settings/SettingsPanel'
import { DeviceNotices } from './ui/stage/DeviceNotices'
import { GameStage } from './ui/stage/GameStage'
import { PortraitCard } from './ui/stage/PortraitCard'
import { SliceScreen } from './ui/screens/SliceScreen'
import { UnsavedChip } from './ui/save/UnsavedChip'
import { ExactAmountSheet } from './ui/sheets/ExactAmountSheet'
import { TitleMenu } from './ui/title/TitleMenu'
import { TouchControls } from './ui/touch/TouchControls'
import { TravelTransitionCard } from './ui/TravelTransitionCard'

export default function App() {
  return (
    <GameStage scene={<GameScene />}>
      <Hud />
      <PlatformScreen />
      <AboveBayLayer />
      <Plaques />
      <TouchControls />
      <TravelTransitionCard />
      <PlanetCard />
      <EndOfSliceCard />
      <SliceScreen />
      <ArtefactChoice />
      <PauseMenu />
      <SettingsPanel />
      <TitleMenu />
      <ExactAmountSheet />
      <DeviceNotices />
      <UnsavedChip />
      <PortraitCard />
    </GameStage>
  )
}
