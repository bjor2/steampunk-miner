/**
 * A node's gear-rim icon with its #158 state badge: a padlock while locked, a rim glint when it can
 * be researched now, the star once its ladder is mastered. Marks reuse the item's glyph; the chip
 * beside it carries the numeral.
 */
import { VectorIcon, type IconBadge, type IconSize } from '../../../ui/VectorIcon'
import type { NodeCardModel } from '../systems/nodeCardModel'

export function NodeIcon({ card, size = 'hud' }: { card: NodeCardModel; size?: IconSize }) {
  return (
    <VectorIcon
      iconId={card.iconId}
      size={size}
      badge={badgeOf(card)}
      hasGlint={card.status === 'affordable'}
    />
  )
}

function badgeOf(card: NodeCardModel): IconBadge | null {
  if (card.markChip?.isMastered === true) return 'maxed'
  return card.status === 'locked' ? 'locked' : null
}
