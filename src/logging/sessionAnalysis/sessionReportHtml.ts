/**
 * The session report page (#125, logging strategy section 6 step 4): one self-contained HTML file
 * per analysis pass, with the text summary on top, a table for every analysis and a chart per
 * charted session. The wall time it names is the caller's; the page reads no clock.
 */
import { fixed, flaggedIndexes, sectionHtml, tableHtml } from './htmlTable'
import { WARM_UP_SAMPLES } from './memoryTrend'
import { formatAnalysisSummary, signedText, type SessionAnalysis } from './sessionAnalysis'
import { CHART_STYLE, escapeHtml } from './sessionChart'
import { chartedSessions, chartsHtml, heapChartOf } from './sessionReportCharts'
import { frameAndBenchSections } from './sessionReportSections'

const PAGE_STYLE = `
  body { font: 14px/1.45 system-ui, sans-serif; margin: 24px auto; max-width: 1080px; padding: 0 16px;
    color: #0b0b0b; background: #fcfcfb; }
  h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 32px; }
  .intro, .none, .generated { color: #52514e; }
  pre.summary { background: #f3f2ee; padding: 12px; white-space: pre-wrap; }
  table { border-collapse: collapse; margin: 8px 0 16px; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 3px 10px 3px 0; border-bottom: 1px solid #e4e3df; }
  td { white-space: nowrap; } td:last-child { white-space: normal; overflow-wrap: anywhere; }
  tr.flagged td { font-weight: 600; }
  .charts { display: flex; flex-wrap: wrap; gap: 12px; }
  @media (prefers-color-scheme: dark) {
    body { color: #ffffff; background: #1a1a19; } .intro, .none, .generated { color: #c3c2b7; }
    pre.summary { background: #262624; } th, td { border-bottom-color: #3a3936; }
  }`

export function renderSessionReportHtml(analysis: SessionAnalysis, generatedAt: string): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<title>Session analysis</title>',
    `<style>${PAGE_STYLE}${CHART_STYLE}</style>`,
    '</head><body>',
    '<h1>Session analysis</h1>',
    `<p class="generated">Generated ${escapeHtml(generatedAt)} by npm run perf:sessions (#125). Report only: no flag here fails a build or opens an issue.</p>`,
    `<pre class="summary">${escapeHtml(formatAnalysisSummary(analysis))}</pre>`,
    sessionsSection(analysis),
    heapSection(analysis),
    countsSection(analysis),
    ...frameAndBenchSections(analysis),
    '</body></html>',
    '',
  ].join('\n')
}

function sessionsSection({ sessions, refused }: SessionAnalysis): string {
  const rows = sessions.map((session) => [
    session.runId,
    session.commit,
    session.source,
    session.startedAtMs === null ? 'n/a' : new Date(session.startedAtMs).toISOString(),
    session.events.length,
    session.folder,
  ])
  const refusedRows = refused.map((one) => [one.folder, one.problems.join('; ')])
  return sectionHtml(
    'sessions',
    'Sessions',
    'Every events.ndjson read, keyed by commit and run id; refused ones were read under another log schema or had a broken line, and were left out whole.',
    tableHtml({ headers: ['run', 'commit', 'source', 'started (UTC)', 'events', 'folder'], rows }) +
      (refusedRows.length > 0
        ? tableHtml({ headers: ['refused folder', 'problems'], rows: refusedRows })
        : ''),
  )
}

function heapSection({ heapTrends, sessions }: SessionAnalysis): string {
  const rows = heapTrends.map((trend) => [
    trend.runId,
    trend.commit,
    trend.samples,
    fixed(trend.heapFirstMB, 1),
    fixed(trend.heapLastMB, 1),
    fixed(trend.heapPeakMB, 1),
    signedText(trend.mbPer100Minerals, 2),
    signedText(trend.mbPer10Minutes, 2),
    signedText(trend.mbPer100Chunks, 2),
  ])
  const headers = ['run', 'commit', 'samples', 'first MB', 'last MB', 'peak MB']
  return sectionHtml(
    'heap',
    'Heap against progress',
    `Live JS heap from memory_sample (every 10 s; no GC forced), after the first ${WARM_UP_SAMPLES} samples of warm-up. Slopes are least-squares fits.`,
    tableHtml({
      headers: [...headers, 'MB / 100 minerals', 'MB / 10 min', 'MB / 100 chunks'],
      rows,
    }) + chartsHtml(chartedSessions(sessions, 'memory_sample').map(heapChartOf)),
  )
}

function countsSection({ countTrends }: SessionAnalysis): string {
  const rows = countTrends.map((trend) => [
    trend.runId,
    trend.commit,
    trend.count,
    trend.first,
    trend.last,
    signedText(trend.per100Chunks, 2),
    trend.risingSteps,
    trend.isClimbing ? 'climbing' : 'flat',
  ])
  return sectionHtml(
    'counts',
    'Geometries, textures and colliders against chunks',
    'These should stay flat once warmed up as chunks load. Climbing: rose in 3 or more of the last 10 steps and never fell (the memory soak rule, #99).',
    tableHtml({
      headers: [
        'run',
        'commit',
        'count',
        'first',
        'last',
        'per 100 chunks',
        'rising steps',
        'verdict',
      ],
      rows,
      flaggedRows: flaggedIndexes(countTrends, (trend) => trend.isClimbing),
    }),
  )
}
