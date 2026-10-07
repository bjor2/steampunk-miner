/**
 * The artefact cache's three cards drawn from their view model (#46 Choice UI): name, one line and
 * Choose on each, then "Leave it". Each is the kernel item card once a describer answers, its
 * flavour and stat lines in place of the summary (K7 #199). Markup only.
 */
import type { ArtefactCard, ArtefactChoiceModel } from '../../systems/views/artefactChoiceModel'
import { ItemCard } from '../kit/ItemCard'
import { Panel } from '../kit/Panel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { VectorIcon } from '../VectorIcon'
import styles from './ArtefactChoice.module.css'

export function ArtefactChoiceView({
  model,
  focusedId,
}: {
  model: ArtefactChoiceModel
  focusedId: string
}) {
  return (
    <div className={styles.overlay} data-testid={UI_IDS.artefactChoice}>
      <Panel title={model.title} iconId={model.titleIconId}>
        <div className={styles.cards}>
          {model.cards.map((card) => (
            <CardView key={card.optionId} card={card} focusedId={focusedId} />
          ))}
        </div>
        <ScreenButtonView button={model.leave} focusedId={focusedId} />
      </Panel>
    </div>
  )
}

function CardView({ card, focusedId }: { card: ArtefactCard; focusedId: string }) {
  const choose = <ScreenButtonView button={card.choose} focusedId={focusedId} />
  return (
    <ItemCard variant="full" card={card.card} action={choose}>
      <article className={styles.card} data-testid={UI_ID_TEMPLATES.artefactCard(card.optionId)}>
        <h3 className={styles.name}>
          <VectorIcon iconId={card.iconId} />
          {card.name}
        </h3>
        <p className={styles.summary}>{card.summary}</p>
        {choose}
      </article>
    </ItemCard>
  )
}
