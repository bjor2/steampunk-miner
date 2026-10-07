/**
 * The pieces of the kernel item card (K7 #199), in #159's line order: the name with its icon on
 * the left (Progression on #164), the stat lines, the cost, the flavour, the unlock line and the
 * gate note. Markup only: the text comes from `itemCardTextOf`.
 */
import type { ItemCardModel } from '../../systems/views/itemCardModel'
import type { ItemCardLineText, ItemCardText } from '../../systems/views/itemCardText'
import { VectorIcon } from '../VectorIcon'
import styles from './ItemCard.module.css'

export function ItemCardName({ card }: { card: ItemCardModel }) {
  return (
    <h3 className={styles.name}>
      <VectorIcon iconId={card.iconId} size="menu" />
      {card.name}
    </h3>
  )
}

/** Everything under the name on the full card. */
export function ItemCardBody({ card, text }: { card: ItemCardModel; text: ItemCardText }) {
  return (
    <>
      <ul className={styles.lines}>
        {text.lines.map((line) => (
          <StatLineView key={line.label} line={line} />
        ))}
      </ul>
      <CostLine card={card} />
      <p className={styles.flavour}>{text.flavour}</p>
      {text.unlock !== null && <p className={styles.note}>{text.unlock}</p>}
      {text.gateNote !== null && <p className={styles.note}>{text.gateNote}</p>}
    </>
  )
}

/** The compact row's one line: the first stat with its change; nothing for a cosmetic. */
export function FirstStatLine({ lines }: { lines: readonly ItemCardLineText[] }) {
  const [first] = lines
  if (first === undefined) return null
  return (
    <span className={styles.line} data-stat-kind={first.kind}>
      <StatNowAndNext line={first} />
      {first.change !== null && <span className={styles.change}> {first.change}</span>}
    </span>
  )
}

/** The full card's cost line; absent for what is picked, not bought. */
export function CostLine({ card }: { card: ItemCardModel }) {
  if (card.cost === null) return null
  return (
    <p className={styles.costLine}>
      Cost <Price card={card} />
    </p>
  )
}

/** The compact row's cost, appended as "· 1.2k" (#159 line 3). */
export function AppendedCost({ card }: { card: ItemCardModel }) {
  if (card.cost === null) return null
  return (
    <span className={styles.costLine}>
      {' · '}
      <Price card={card} />
    </span>
  )
}

function Price({ card }: { card: ItemCardModel }) {
  const cost = card.cost
  if (cost === null) return null
  return (
    <span
      className={styles.price}
      data-exact={cost.exact}
      data-money-short={card.isMoneyShort || undefined}
    >
      {cost.text}
    </span>
  )
}

function StatLineView({ line }: { line: ItemCardLineText }) {
  return (
    <li className={styles.line} data-stat-kind={line.kind}>
      <StatNowAndNext line={line} />
      {line.change !== null && <span className={styles.change}> {line.change}</span>}
      {line.major !== null && <span className={styles.aside}> · {line.major}</span>}
      {line.cap !== null && <span className={styles.aside}> · {line.cap}</span>}
    </li>
  )
}

function StatNowAndNext({ line }: { line: ItemCardLineText }) {
  return (
    <>
      {line.label} {line.now}
      {line.next !== null && <> → {line.next}</>}
    </>
  )
}
