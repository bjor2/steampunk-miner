/**
 * The Upgrade bay's live vehicle preview (#37, #44): the preview scene, the brass gauge of levels
 * toward the next visual tier, the focused track's stats before and after, and, with the Casing
 * row focused, a swatch of the next grade's lining. Its root carries the preview's view model as
 * `data-*` so a spec reads what it draws. Markup only, plus the timer that ends an install.
 */
import { useEffect, type CSSProperties } from 'react'
import { PART_INSTALL_MS } from '../../constants/scene'
import { VehiclePreviewScene } from '../../scene/VehiclePreviewScene'
import { useGameStore } from '../../store/gameStore'
import type { UpgradeId } from '../../systems/economy/economyDefinition'
import { gaugeTicksOf, type UpgradePreview } from '../../systems/views/upgradePreview'
import { UI_IDS } from '../ids'
import { VectorIcon } from '../VectorIcon'
import styles from './VehiclePreviewPanel.module.css'

export function VehiclePreviewPanel({
  preview,
  tierIconId,
}: {
  preview: UpgradePreview
  tierIconId: string
}) {
  useEndOfPartInstall(preview.installing)
  return (
    <section
      className={styles.preview}
      data-testid={UI_IDS.upgradebayPreview}
      data-highlight={preview.highlight ?? ''}
      data-visual-tier={preview.visualTier}
      data-owned-tier={preview.ownedTier}
      data-ghost-tier={preview.ghostTier ?? ''}
      data-gauge={preview.gauge.owned}
      data-gauge-span={preview.gauge.span ?? ''}
      data-installing={preview.installing !== null}
      data-lining-grade={preview.liningGrade ?? ''}
    >
      <div className={styles.stage}>
        <VehiclePreviewScene preview={preview} />
      </div>
      <TierGauge preview={preview} tierIconId={tierIconId} />
      <PreviewCaption preview={preview} />
    </section>
  )
}

/** One brass tick per level to the next tier; the pending buy's tick is hollow and marked. */
function TierGauge({ preview, tierIconId }: { preview: UpgradePreview; tierIconId: string }) {
  const ticks = gaugeTicksOf(preview.gauge)
  return (
    <div className={styles.gauge}>
      <VectorIcon iconId={tierIconId} size="menu" />
      <span>Tier {preview.ownedTier}</span>
      <span className={styles.ticks} aria-hidden>
        {ticks.map((tick, at) => (
          <span key={at} className={styles.tick} data-tick={tick} />
        ))}
      </span>
      {preview.gauge.span === null && <span>+{preview.gauge.owned} levels</span>}
      {preview.ghostTier !== null && <span>→ Tier {preview.ghostTier}</span>}
    </div>
  )
}

/** What the focused row would change: the track's stats, or the casing's next lining. */
function PreviewCaption({ preview }: { preview: UpgradePreview }) {
  if (preview.liningGrade !== null) return <LiningSwatch grade={preview.liningGrade} />
  if (preview.effect === null) return null
  return (
    <p className={styles.effect}>
      {preview.effect.before.text} → {preview.effect.after.text}
    </p>
  )
}

/** The next grade's lining: one stripe per grade on the casing's teal (#41 grade stripes). */
function LiningSwatch({ grade }: { grade: number }) {
  return (
    <div className={styles.lining}>
      <span
        className={styles.swatch}
        data-grade={grade}
        style={{ '--grade': grade } as CSSProperties}
      />
      <span>Casing grade {grade} lining</span>
    </div>
  )
}

/**
 * The install runs 0.4 s, then the preview shows the new part at rest (#44); closing the bay
 * ends it at once, so the next visit never replays it.
 */
function useEndOfPartInstall(installing: UpgradeId | null): void {
  useEffect(() => endPartInstall, [])
  useEffect(() => {
    if (installing === null) return
    const timer = setTimeout(endPartInstall, PART_INSTALL_MS)
    return () => clearTimeout(timer)
  }, [installing])
}

function endPartInstall(): void {
  useGameStore.getState().endPartInstall()
}
