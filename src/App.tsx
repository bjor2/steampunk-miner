import { GameScene } from './scene/GameScene'
import { ArtefactChoice } from './ui/artefact/ArtefactChoice'
import { EndOfSliceCard } from './ui/EndOfSliceCard'
import { Hud } from './ui/hud/Hud'
import { PlatformScreen } from './ui/platform/PlatformScreen'
import { Plaques } from './ui/plaques/Plaques'
import { SettingsPanel } from './ui/settings/SettingsPanel'
import { GameStage } from './ui/stage/GameStage'
import { PortraitCard } from './ui/stage/PortraitCard'
import { TravelTransitionCard } from './ui/TravelTransitionCard'

export default function App() {
  return (
    <GameStage scene={<GameScene />}>
      <Hud />
      <PlatformScreen />
      <Plaques />
      <TravelTransitionCard />
      <EndOfSliceCard />
      <ArtefactChoice />
      <SettingsPanel />
      <PortraitCard />
    </GameStage>
  )
}
