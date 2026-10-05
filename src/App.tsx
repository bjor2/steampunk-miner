import { GameScene } from './scene/GameScene'
import { EndOfSliceCard } from './ui/EndOfSliceCard'
import { Hud } from './ui/hud/Hud'
import { PlatformScreen } from './ui/platform/PlatformScreen'
import { SettingsPanel } from './ui/settings/SettingsPanel'
import { TravelTransitionCard } from './ui/TravelTransitionCard'

export default function App() {
  return (
    <>
      <GameScene />
      <Hud />
      <PlatformScreen />
      <TravelTransitionCard />
      <EndOfSliceCard />
      <SettingsPanel />
    </>
  )
}
