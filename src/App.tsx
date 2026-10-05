import { GameScene } from './scene/GameScene'
import { EndOfSliceCard } from './ui/EndOfSliceCard'
import { Hud } from './ui/Hud'
import { TravelTransitionCard } from './ui/TravelTransitionCard'

export default function App() {
  return (
    <>
      <GameScene />
      <Hud />
      <TravelTransitionCard />
      <EndOfSliceCard />
    </>
  )
}
