/**
 * One flat vector icon of the set (#44, #158). Decorative: the row's label says the same, so
 * screen readers skip it. `size` follows #158's sizes: `row` is the shop's 2em (48 px at the 1080p
 * shop type, #44), `hud` 24 px at 1080p and never under 20 physical px, `banner` 32 px, `menu` the
 * surrounding type's 1em, allowed only in menus, shop lists and tooltips. A state is a badge with
 * its own shape (padlock, star) or a rim glint, never a colour.
 *
 * An id with no icon draws a placeholder that shows, never a blank (feature-slices.md 3.4): a
 * magenta square in dev, which also warns once per id, a neutral outlined square in production.
 */
import { useEffect } from 'react'
import { IS_DEV_BUILD } from '../constants/buildInfo'
import styles from './VectorIcon.module.css'
import { iconUrlOf, warnOfMissingIcon } from './vectorIcons'

export type IconSize = 'row' | 'hud' | 'banner' | 'menu'

export type IconBadge = 'locked' | 'maxed'

export function VectorIcon({
  iconId,
  size = 'row',
  badge = null,
  hasGlint = false,
}: {
  iconId: string
  size?: IconSize
  badge?: IconBadge | null
  hasGlint?: boolean
}) {
  const url = iconUrlOf(iconId)
  const isMissing = url === null
  useEffect(() => warnInDevOfMissingIcon(iconId, isMissing), [iconId, isMissing])
  return (
    <span
      className={`${styles.icon} ${styles[size]}`}
      data-testid={iconId}
      data-missing-icon={isMissing ? iconId : undefined}
      data-badge={badge ?? undefined}
      data-glint={hasGlint || undefined}
      aria-hidden
    >
      {isMissing ? (
        <span className={MISSING_FACE_CLASS} />
      ) : (
        <img className={styles.image} src={url} alt="" draggable={false} />
      )}
      {badge !== null && <Badge badge={badge} />}
    </span>
  )
}

const MISSING_FACE_CLASS = IS_DEV_BUILD ? styles.missingInDev : styles.missing

function warnInDevOfMissingIcon(iconId: string, isMissing: boolean): void {
  if (IS_DEV_BUILD && isMissing) warnOfMissingIcon(iconId)
}

/** A padlock or a star over the icon's corner, in brass with an ink edge, on every panel. */
function Badge({ badge }: { badge: IconBadge }) {
  return (
    <svg className={styles.badge} viewBox="0 0 12 12">
      <path d={BADGE_PATHS[badge]} fill="#c9a24b" stroke="#1b1613" strokeWidth="1" />
    </svg>
  )
}

const BADGE_PATHS: Readonly<Record<IconBadge, string>> = {
  locked: 'M3 5V3.5a3 3 0 0 1 6 0V5h1v6H2V5zM4.5 5h3V3.5a1.5 1.5 0 0 0-3 0z',
  maxed: 'M6 1l1.5 3.2 3.5.4-2.6 2.4.7 3.5L6 8.8 2.9 10.5l.7-3.5L1 4.6l3.5-.4z',
}
