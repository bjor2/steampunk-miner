/**
 * The HUD coverage overlay (spec #678 GD lock, ticket 682): while the debug API's
 * `ui.showHudCoverage(true)` holds it on, it re-measures the page four times a second and draws
 * the middle band (hatched), the design's reserved boxes (dashed brass), every measured HUD box
 * (steel, red where it enters the band) and, on a phone, the top keep-out and the stick zone,
 * with one line reporting the measured share, the budget and the reserved layout's share. It
 * takes no tap and carries no `data-hud`, so it never measures itself.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { HUD_COVERAGE_POLL_MS } from '../../constants/screen'
import type { ScreenBox } from '../../systems/views/hudClearView'
import {
  boxRectOf,
  coverageLineOf,
  type HudCoverageReport,
} from '../../systems/views/hudCoverageReport'
import { DEBUG_UI_IDS } from './debugUiIds'
import { isHudCoverageShown, subscribeHudCoverage } from './hudCoverageSwitch'
import { measureHudCoverage } from './measureHudCoverage'
import styles from './HudCoverageOverlay.module.css'

export function HudCoverageOverlay() {
  const isShown = useSyncExternalStore(subscribeHudCoverage, isHudCoverageShown)
  return isShown ? <CoverageMarks /> : null
}

function CoverageMarks() {
  const report = useMeasuredCoverage()
  if (report === null) return null
  return (
    <div
      className={styles.overlay}
      data-testid={DEBUG_UI_IDS.hudCoverage}
      data-layout={report.kind}
      data-measured-percent={report.measuredPercent}
      data-reserved-percent={report.reservedPercent}
      data-budget-percent={report.budgetPercent}
    >
      <Mark box={report.middleBand} className={styles.band} testId={DEBUG_UI_IDS.hudCoverageBand} />
      <KeepOutMarks report={report} />
      {Object.entries(report.reserved).map(([id, box]) => (
        <Mark key={id} box={box} className={styles.reserved} />
      ))}
      {report.measured.map((box, index) => (
        <Mark
          key={`${box.id}-${index}`}
          box={box}
          className={box.isInBand ? styles.inBand : styles.measured}
        />
      ))}
      <p
        className={styles.readout}
        data-testid={DEBUG_UI_IDS.hudCoverageReadout}
        data-within-budget={report.isMeasuredWithinBudget}
      >
        {coverageLineOf(report)}
      </p>
    </div>
  )
}

/** The phone's top keep-out and stick zone; desktop has neither. */
function KeepOutMarks({ report }: { report: HudCoverageReport }) {
  return (
    <>
      {report.topKeepOut && <Mark box={report.topKeepOut} className={styles.keepOut} />}
      {report.stickZone && <Mark box={report.stickZone} className={styles.keepOut} />}
    </>
  )
}

function Mark({ box, className, testId }: { box: ScreenBox; className: string; testId?: string }) {
  return <div className={className} style={boxRectOf(box)} data-testid={testId} />
}

/** The report, measured again four times a second while the overlay shows. */
function useMeasuredCoverage(): HudCoverageReport | null {
  const [report, setReport] = useState<HudCoverageReport | null>(null)
  useEffect(() => {
    const measure = () => setReport(measureHudCoverage())
    measure()
    const timer = window.setInterval(measure, HUD_COVERAGE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [])
  return report
}
