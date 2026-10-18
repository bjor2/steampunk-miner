/**
 * The debug flag panel (ticket 549), open while the store holds it: its model read from the
 * authority and the store, re-read as the flags change.
 */
import { readDevFlagPanelModel } from '../../store/devFlagReads'
import { useGameStore } from '../../store/gameStore'
import { useScreenModel } from '../useScreenModel'
import { DevFlagPanelView } from './DevFlagPanelView'

export function DevFlagPanel() {
  const isOpen = useGameStore((state) => state.isDevFlagPanelOpen)
  return isOpen ? <OpenDevFlagPanel /> : null
}

function OpenDevFlagPanel() {
  const model = useScreenModel(readDevFlagPanelModel)
  return <DevFlagPanelView model={model} />
}
