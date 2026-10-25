/**
 * An artefact card's face on brass (ticket 885): the option's name and one line on the shared
 * Title+OneLine element, then each stat line as its label and its value as an icon-plus-value
 * fact in the option's own glyph, the value as the describer formatted it (#681). An artefact is
 * picked, never levelled, so a line shows its value now and its cap, never a next value, a change
 * or a major. While no describer answers, the kernel summary is the one line, as before (K7 #199's
 * empty fast path).
 */
import type { StatLine } from '../registries/itemDescriber'
import type { ArtefactCard } from './artefactChoiceModel'
import type { ElementText } from './uiText'

export interface ArtefactStatFact {
  iconId: string
  text: string
}

export interface ArtefactStatRow {
  label: string
  fact: ArtefactStatFact
}

export interface ArtefactCardFace {
  text: ElementText
  iconId: string
  stats: readonly ArtefactStatRow[]
}

const CAP_LABEL = 'Cap'

export function artefactCardFaceOf(card: ArtefactCard): ArtefactCardFace {
  const description = card.card.description
  return {
    text: {
      id: `artefact.${card.optionId}`,
      title: card.name,
      oneLine: description?.flavour ?? card.summary,
      tooltipLines: [],
    },
    iconId: card.iconId,
    stats: (description?.statLines ?? []).flatMap((line) => statRowsOf(line, card.iconId)),
  }
}

function statRowsOf(line: StatLine, iconId: string): ArtefactStatRow[] {
  const now = { label: line.label, fact: { iconId, text: line.now } }
  if (line.cap === undefined) return [now]
  return [now, { label: CAP_LABEL, fact: { iconId, text: line.cap.value } }]
}
