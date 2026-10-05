/**
 * The fixed-camera accessibility option (#13): switches between the camera that rolls with the
 * planet and one that keeps north up. Presentation only; controls never change (#7).
 */
import { useGameStore } from '../store/gameStore'
import { otherCameraMode, type CameraMode } from '../systems/render/cameraTurn'
import { Button } from './kit/Button'
import { Panel } from './kit/Panel'

const LABEL_OF_MODE: Readonly<Record<CameraMode, string>> = {
  rotating: 'Rotating with planet',
  fixed: 'Fixed, north up',
}

export function CameraModeToggle() {
  const cameraMode = useGameStore((state) => state.cameraMode)
  const setCameraMode = useGameStore((state) => state.setCameraMode)
  const switchMode = () => setCameraMode(otherCameraMode(cameraMode))

  return (
    <Panel title="Camera">
      <Button label={LABEL_OF_MODE[cameraMode]} onPress={switchMode} />
    </Panel>
  )
}
