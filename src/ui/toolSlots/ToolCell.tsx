/**
 * One tool slot cell (ticket 691; docs/ui/design-system.md section 10): a `--slot-cell` button with
 * the tool's icon and a cooldown ring of `--slot-cooldown-ring`, never text, and a charges badge
 * through the shared formatter once the tool holds more than one charge (the VS condition). The
 * ring is drawn from the face's share each refresh, with no minimum length. The kernel draws every
 * cell with this; a row's own cell passes its pointer handlers, its test id and what rides it.
 */
import type { CSSProperties, PointerEventHandler, ReactNode } from 'react'
import type { ToolFace } from '../../systems/input/toolSlots'
import { chargeBadgeTextOf } from '../../systems/views/toolSlotBar'
import { hudBoxOf } from '../hud/hudBoxes'
import { VectorIcon } from '../VectorIcon'
import styles from './ToolCell.module.css'

export interface ToolCellPointer {
  onPointerDown?: PointerEventHandler<HTMLButtonElement>
  onPointerMove?: PointerEventHandler<HTMLButtonElement>
  onPointerUp?: PointerEventHandler<HTMLButtonElement>
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>
}

export function ToolCell({
  face,
  testId,
  pointer,
  isPressed = false,
  children,
}: {
  face: ToolFace
  testId: string
  pointer: ToolCellPointer
  isPressed?: boolean
  /** What rides the cell: a corner control, a hold ring, an item card. */
  children?: ReactNode
}) {
  const ring = { '--cooldown': `${face.cooldownPercent}%` } as CSSProperties
  const badge = chargeBadgeTextOf(face)
  return (
    <div className={styles.slot}>
      {/* Pointer only: the keyboard has the number keys themselves, so Tab never stops here. */}
      <button
        type="button"
        className={styles.cell}
        style={ring}
        data-testid={testId}
        {...hudBoxOf('tool-slot')}
        data-on={face.isOn || undefined}
        data-acting={face.isActing || undefined}
        data-cooling={face.cooldownPercent > 0 || undefined}
        data-pressed={isPressed || undefined}
        aria-label={face.name}
        tabIndex={-1}
        {...pointer}
      >
        <VectorIcon iconId={face.iconId} size="menu" />
        {badge !== null && (
          <span className={styles.badge} aria-hidden>
            {badge}
          </span>
        )}
      </button>
      {children}
    </div>
  )
}
