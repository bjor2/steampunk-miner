/**
 * The session report's charts (#125): heap and frame p95 against time, for the
 * newest sessions that logged them; the tables keep every session.
 */
import { FRAME_BUDGET_MS } from '../../constants/scene'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { drawLineChart } from './sessionChart'
import { eventsNamed, type SessionLog } from './sessionTable'

/** Charts for the newest sessions only; every session stays in the tables. */
export const MAX_CHARTED_SESSIONS = 6
const KIB_PER_MIB = 1024

/** The newest sessions with lines of `name`, oldest of them first. */
export function chartedSessions(
  sessions: readonly SessionLog[],
  name: 'memory_sample' | 'perf_sample',
) {
  return sessions
    .filter((session) => eventsNamed(session, name).length > 1)
    .slice(-MAX_CHARTED_SESSIONS)
}

/**
 * Heap over seconds of frames: minerals come in steps (none for minutes, then several), so a chart
 * against them folds back on itself; the table holds the slopes against every progress marker.
 */
export function heapChartOf(session: SessionLog): string {
  const samples = eventsNamed(session, 'memory_sample').map((line) => line.data)
  return drawLineChart({
    title: `Heap, ${session.runId} (${session.commit})`,
    xLabel: 's of frames',
    yLabel: 'MB',
    points: samples.map((sample) => ({ x: sample.elapsedS, y: sample.jsHeapUsedKB / KIB_PER_MIB })),
  })
}

export function chartsHtml(charts: readonly string[]): string {
  const drawn = charts.filter((chart) => chart !== '')
  return drawn.length === 0 ? '' : `<div class="charts">\n${drawn.join('\n')}\n</div>`
}

/** A perf_sample's frame p95 against seconds since the session's first sample. */
export function frameChartOf(session: SessionLog): string {
  const samples = eventsNamed(session, 'perf_sample')
  const firstTick = samples[0]?.tick ?? 0
  return drawLineChart({
    title: `Frame p95, ${session.runId} (${session.commit})`,
    xLabel: 's of play',
    yLabel: 'ms',
    points: samples.map((sample) => ({
      x: Math.round((sample.tick - firstTick) / TICKS_PER_SECOND),
      y: sample.data.frameMsP95,
    })),
    reference: { y: FRAME_BUDGET_MS, label: `budget ${FRAME_BUDGET_MS} ms` },
  })
}
