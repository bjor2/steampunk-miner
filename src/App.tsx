import { GameScene } from './scene/GameScene'
import { ArtefactChoice } from './ui/artefact/ArtefactChoice'
import { EndOfSliceCard } from './ui/EndOfSliceCard'
import { Hud } from './ui/hud/Hud'
import { PlatformScreen } from './ui/platform/PlatformScreen'
import { Plaques } from './ui/plaques/Plaques'
import { SettingsPanel } from './ui/settings/SettingsPanel'
import { TravelTransitionCard } from './ui/TravelTransitionCard'

export default function App() {
  return (
    <>
      <GameScene />
      <Hud />
      <PlatformScreen />
      <Plaques />
      <TravelTransitionCard />
      <EndOfSliceCard />
      <ArtefactChoice />
      <SettingsPanel />
    </>
  )
}
