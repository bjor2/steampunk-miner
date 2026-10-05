/**
 * `selectArtefactChoiceModel` (#46 Choice UI): the cache's three mutually exclusive cards as data,
 * each with the option's name, its one line and a Choose button that carries `ChooseArtefact`
 * with the authority's refusal reason now, plus "Leave it", which closes the cards and sends
 * nothing, so the cache stays live.
 *
 * Focus starts on "Leave it": the same key opens the cache (`interact`) and confirms a card
 * (`ui_confirm`), and a pick is for good, so a double press must never choose.
 *
 * `isChoiceOpenAfter` is the cards' open state over the authority's answers: they open on
 * this player's `artefact_open` and close on their `artefact_chosen`.
 */
import { ARTEFACT_OPTIONS, type ArtefactOption } from '../artefacts/artefactOptions'
import { chooseArtefactCommand } from '../artefacts/artefactCommands'
import type { AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import type { FocusStop } from './menuFocus'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { commandButton, uiButton, type ScreenButton } from './viewParts'

export interface ArtefactCard {
  optionId: string
  name: string
  summary: string
  choose: ScreenButton
}

export interface ArtefactChoiceModel {
  title: string
  cards: ArtefactCard[]
  leave: ScreenButton
  focusStops: FocusStop[]
}

export const ARTEFACT_CHOICE_START_FOCUS: string = UI_IDS.artefactLeave

const PANEL = 'artefact'

export function selectArtefactChoiceModel(
  state: AuthorityState,
  playerId: string,
): ArtefactChoiceModel {
  const cards = ARTEFACT_OPTIONS.map((option) => cardOf(state, playerId, option))
  const leave = uiButton(UI_IDS.artefactLeave, 'Leave it', { kind: 'closeArtefactChoice' })
  return {
    title: 'Ancient cache: take one, the others are lost',
    cards,
    leave,
    focusStops: [...cards.map((card) => card.choose), leave].map(({ id }) => ({
      id,
      panel: PANEL,
    })),
  }
}

/** Open after this player's `artefact_open`, closed after their `artefact_chosen`. */
export function isChoiceOpenAfter(
  events: readonly DomainEvent[],
  playerId: string,
  wasOpen: boolean,
): boolean {
  return events
    .filter((event) => event.playerId === playerId)
    .reduce((isOpen, event) => openStateAfterEvent(event, isOpen), wasOpen)
}

function openStateAfterEvent(event: DomainEvent, isOpen: boolean): boolean {
  if (event.type === 'ArtefactCacheOpened') return true
  if (event.type === 'ArtefactChosen') return false
  return isOpen
}

function cardOf(state: AuthorityState, playerId: string, option: ArtefactOption): ArtefactCard {
  return {
    optionId: option.id,
    name: option.name,
    summary: option.summary,
    choose: commandButton(
      state,
      playerId,
      UI_ID_TEMPLATES.artefactChoose(option.id),
      'Choose',
      chooseArtefactCommand(option.id),
    ),
  }
}
