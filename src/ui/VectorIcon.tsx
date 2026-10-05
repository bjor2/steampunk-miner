/**
 * One flat vector icon (#44), sized by the text around it so it scales with the shop's type and
 * stays crisp at 4K. Decorative: the row's label says the same, so screen readers skip it.
 */
import styles from './VectorIcon.module.css'
import { iconUrlOf } from './vectorIcons'

export function VectorIcon({ iconId }: { iconId: string }) {
  const url = iconUrlOf(iconId)
  if (url === null) return <span className={styles.icon} data-testid={iconId} aria-hidden />
  return <img className={styles.icon} src={url} alt="" data-testid={iconId} draggable={false} />
}
