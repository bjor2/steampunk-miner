/** The artefact cache's cards (#46), open after `artefact_open`; the store's model and focus. */
import { useGameStore } from '../../store/gameStore'
import { readArtefactChoiceModel } from '../../store/screenReads'
import { ARTEFACT_CHOICE_START_FOCUS } from '../../systems/views/artefactChoiceModel'
import { focusOnScreen } from '../../systems/views/menuFocus'
import { useScreenModel } from '../useScreenModel'
import { ArtefactChoiceView } from './ArtefactChoiceView'

export function ArtefactChoice() {
  const isOpen = useGameStore((state) => state.isArtefactChoiceOpen)
  return isOpen ? <OpenArtefactChoice /> : null
}

function OpenArtefactChoice() {
  const model = useScreenModel(readArtefactChoiceModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, ARTEFACT_CHOICE_START_FOCUS)
  return <ArtefactChoiceView model={model} focusedId={focusedId} />
}
