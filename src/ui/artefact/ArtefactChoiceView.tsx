/**
 * The artefact cache's cards drawn from their view model (#46 Choice UI), on brass since ticket
 * 885: the kit's sheet-framed panel titled on the shared Title+OneLine element, and per option a
 * card in the baked card frame (#683) with its name and one line, each stat line's value as an
 * icon-plus-value fact (`artefactCardFaceOf`), and its kit Choose; then "Leave it". On a phone held
 * upright the cards stand in one column and scroll in the shared scroll area (#470 PT-5). Markup
 * only.
 */
import { artefactCardFaceOf, type ArtefactStatRow } from '../../systems/views/artefactCardFace'
import type { ArtefactCard, ArtefactChoiceModel } from '../../systems/views/artefactChoiceModel'
import { IconFact } from '../kit/IconFacts'
import { Panel } from '../kit/Panel'
import { ScrollArea } from '../kit/ScrollArea'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './ArtefactChoice.module.css'

const HEADING_ID = 'artefact.cache'

export function ArtefactChoiceView({
  model,
  focusedId,
}: {
  model: ArtefactChoiceModel
  focusedId: string
}) {
  return (
    <div className={styles.overlay} data-testid={UI_IDS.artefactChoice}>
      <Panel
        frame="sheet"
        title={model.title}
        iconId={model.titleIconId}
        heading={{ id: HEADING_ID, oneLine: model.oneLine, tooltipLines: [] }}
      >
        <ScrollArea className={styles.scroll}>
          <div className={styles.cards}>
            {model.cards.map((card) => (
              <CardView key={card.optionId} card={card} focusedId={focusedId} />
            ))}
          </div>
        </ScrollArea>
        <ScreenButtonView button={model.leave} focusedId={focusedId} />
      </Panel>
    </div>
  )
}

function CardView({ card, focusedId }: { card: ArtefactCard; focusedId: string }) {
  const face = artefactCardFaceOf(card)
  return (
    <article className={styles.card} data-testid={UI_ID_TEMPLATES.artefactCard(card.optionId)}>
      <TitleOneLine text={face.text} iconId={face.iconId}>
        {face.stats.length > 0 && <StatRows rows={face.stats} />}
        <ScreenButtonView button={card.choose} focusedId={focusedId} />
      </TitleOneLine>
    </article>
  )
}

function StatRows({ rows }: { rows: readonly ArtefactStatRow[] }) {
  return (
    <ul className={styles.stats}>
      {rows.map((row) => (
        <li key={row.label} className={styles.stat}>
          <span>{row.label}</span>
          <IconFact fact={row.fact} />
        </li>
      ))}
    </ul>
  )
}
