/**
 * The frame, mined-order, bench and summary sections of the session report page (#125).
 */
import { FRAME_BUDGET_MS } from '../../constants/scene'
import { BASELINE_DAYS, REGRESSION_PERCENT, type BenchTrendRow } from './benchTrend'
import type { FrameStretch } from './frameStretches'
import { fixed, flaggedIndexes, sectionHtml, tableHtml } from './htmlTable'
import { signedText, type SessionAnalysis } from './sessionAnalysis'
import { escapeHtml } from './sessionChart'
import { chartedSessions, chartsHtml, frameChartOf } from './sessionReportCharts'
import type { SessionComparison } from './summaryComparison'

export function frameAndBenchSections(analysis: SessionAnalysis): string[] {
  return [
    frameCostSection(analysis),
    stretchesSection(analysis),
    minedOrderSection(analysis),
    benchSection(analysis),
    comparisonsSection(analysis),
  ]
}

function frameCostSection({ frameCost, sessions }: SessionAnalysis): string {
  const rows = frameCost.map((row) => [
    row.runId,
    row.commit,
    row.planet,
    row.band,
    row.samples,
    fixed(row.medianFrameMsP95, 2),
    fixed(row.worstFrameMsP99, 2),
    row.longTasks,
    row.secondsOverBudget,
  ])
  return sectionHtml(
    'frames',
    'Frame cost by planet and depth band',
    `perf_sample seconds grouped by the planet and the depth band the vehicle was in. Budget: p95 at most ${FRAME_BUDGET_MS} ms (#38).`,
    tableHtml({
      headers: [
        'run',
        'commit',
        'planet',
        'band',
        's',
        'median p95 ms',
        'worst p99 ms',
        'long tasks',
        's over budget',
      ],
      rows,
    }) + chartsHtml(chartedSessions(sessions, 'perf_sample').map(frameChartOf)),
  )
}

function stretchesSection({ slowdowns, longTaskBursts }: SessionAnalysis): string {
  return sectionHtml(
    'stretches',
    'Slowdowns and long-task bursts',
    `A slowdown is a run of seconds with p95 over ${FRAME_BUDGET_MS} ms; a burst a run of seconds with frames over 50 ms. Each names the ore last collected before it, ready to replay to.`,
    tableHtml({
      headers: [
        'kind',
        'run',
        'commit',
        'from tick',
        's',
        'worst p99 ms',
        'long tasks',
        'planet',
        'depth',
        'ore before',
        'ore depth',
        'chunk',
        'ticks before',
      ],
      rows: [...slowdowns, ...longTaskBursts].map(stretchRow),
    }),
  )
}

function stretchRow(stretch: FrameStretch): (string | number)[] {
  const ore = stretch.mineralBefore
  return [
    stretch.kind === 'slowdown' ? 'slowdown' : 'long-task burst',
    stretch.runId,
    stretch.commit,
    stretch.fromTick,
    stretch.seconds,
    fixed(stretch.worstFrameMsP99, 2),
    stretch.longTasks,
    stretch.planet,
    stretch.depthTiles,
    ore?.oreId ?? 'none',
    ore?.oreDepthTiles ?? '',
    ore?.chunk ?? '',
    ore?.ticksBefore ?? '',
  ]
}

function minedOrderSection({ slowdownsByOre }: SessionAnalysis): string {
  return sectionHtml(
    'mined-order',
    'Mined order before slowdowns',
    'How many slowdowns each ore was the last one collected before (resource_collected, #122).',
    tableHtml({ headers: ['ore', 'slowdowns after it'], rows: slowdownsByOre }),
  )
}

function benchSection({ benchTrend }: SessionAnalysis): string {
  return sectionHtml(
    'bench',
    'Benchmark trend per commit',
    `One point per commit and series (the median of its runs, benchmark_result #124). Flagged: more than ${REGRESSION_PERCENT}% over the median of the commits measured in the ${BASELINE_DAYS} days before it on the same source.`,
    tableHtml({
      headers: [
        'source',
        'series',
        'commit',
        'measured (UTC)',
        'runs',
        'median µs',
        'p95 µs',
        `${BASELINE_DAYS}-day median µs`,
        'commits',
        'change',
        'flag',
      ],
      rows: benchTrend.map(benchRow),
      flaggedRows: flaggedIndexes(benchTrend, (row) => row.isRegression),
    }),
  )
}

function benchRow(row: BenchTrendRow): (string | number)[] {
  return [
    row.source,
    row.series,
    row.commit,
    new Date(row.measuredAtMs).toISOString(),
    row.results,
    row.medianUs,
    row.p95Us,
    row.baselineUs ?? 'n/a',
    row.baselineCommits,
    row.changePercent === null ? 'n/a' : `${signedText(row.changePercent, 1)}%`,
    row.isRegression ? `regression > ${REGRESSION_PERCENT}%` : '',
  ]
}

function comparisonsSection({ comparisons }: SessionAnalysis): string {
  return sectionHtml(
    'summaries',
    'Run summaries across commits',
    'The newest session of each source and world seed against the newest before it on another commit, as compareRuns tables them. Differences are reported, never judged.',
    comparisons.length === 0
      ? '<p class="none">None.</p>'
      : comparisons.map(comparisonHtml).join('\n'),
  )
}

/** compareRuns' rows (decision #11 section 3), headed by the two sessions' commits. */
function comparisonHtml(one: SessionComparison): string {
  const heading = `${one.source}, seed ${one.worldSeed}: ${one.before.runId} (${one.before.commit}) → ${one.after.runId} (${one.after.commit})`
  const body = one.comparison.ok
    ? tableHtml({
        headers: ['metric', one.before.commit, one.after.commit, 'change'],
        rows: one.comparison.rows.map((row) => [row.metric, row.a, row.b, row.change]),
      })
    : `<p>Refused: ${escapeHtml(one.comparison.problems.join('; '))}</p>`
  return `<h3>${escapeHtml(heading)}</h3>\n${body}`
}
