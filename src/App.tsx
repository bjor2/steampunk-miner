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
import { DevFlagBadge } from './ui/debug/DevFlagBadge'
import { DevFlagPanel } from './ui/debug/DevFlagPanel'
import { HudCoverageOverlay } from './ui/debug/HudCoverageOverlay'
import { VersionLabel } from './ui/debug/VersionLabel'
import { DeviceNotices } from './ui/stage/DeviceNotices'
import { GameStage } from './ui/stage/GameStage'
import { UnsupportedDeviceCard } from './ui/stage/UnsupportedDeviceCard'
import { UiArtTokens } from './ui/kit/UiArtTokens'
import { SliceScreen } from './ui/screens/SliceScreen'
import { BaseSheet } from './ui/sheet/BaseSheet'
import { SheetDock } from './ui/sheet/SheetDock'
import { LedgerToast } from './ui/save/LedgerToast'
import { UnsavedChip } from './ui/save/UnsavedChip'
import { ExactAmountSheet } from './ui/sheets/ExactAmountSheet'
import { TitleMenu } from './ui/title/TitleMenu'
import { TouchControls } from './ui/touch/TouchControls'
import { TravelTransitionCard } from './ui/TravelTransitionCard'

export default function App() {
  return (
    <GameStage scene={<GameScene />} dock={<SheetDock />}>
      <UiArtTokens />
      <Hud />
      <PlatformScreen />
      <AboveBayLayer />
      <Plaques />
      <TouchControls />
      <TravelTransitionCard />
      <PlanetCard />
      <EndOfSliceCard />
      <BaseSheet at="full" />
      <SliceScreen />
      <ArtefactChoice />
      <PauseMenu />
      <SettingsPanel />
      <TitleMenu />
      <ExactAmountSheet />
      <DeviceNotices />
      <UnsavedChip />
      <LedgerToast />
      <VersionLabel />
      <DevFlagBadge />
      <DevFlagPanel />
      <HudCoverageOverlay />
      <UnsupportedDeviceCard />
    </GameStage>
  )
}
