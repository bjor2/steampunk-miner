// The model behind the Performance section of /status/: the measurement runs in
// docs/perf/history.ndjson ordered by commit time, one chart per metric id that ever appears,
// labelled and judged by docs/perf/metrics.json. Pure: no fs, no clock, no git, so the Pages job
// (a depth-1 checkout) and the tests feed it the same two strings.

export const UNREGISTERED_GROUP = 'Not in metrics.json'
const SHORT_SHA_LENGTH = 7
// The y axis ends on the first of these fractions of a power of ten above the data (with a
// little headroom), so a budget never sits on the top edge and the gridline labels stay round.
const NICE_FRACTIONS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
const HEADROOM = 1.08
// The "Recent runs" table of the Performance tab shows this many of the latest measurements.
const RECENT_RUN_COUNT = 8

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stampMsOf(iso) {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN
  return Number.isFinite(ms) ? ms : null
}

function stringOrNull(value) {
  return typeof value === 'string' ? value : null
}

export function shortShaOf(commit) {
  return commit.slice(0, SHORT_SHA_LENGTH)
}

/** The DOM id of a metric's figure: `metric-` plus the id with every non-alphanumeric as `-`. */
export function figureIdOf(metricId) {
  return `metric-${metricId.replace(/[^a-zA-Z0-9]/g, '-')}`
}

function problemOfEntry(entry) {
  if (!isRecord(entry)) return 'not a JSON object'
  if (typeof entry.commit !== 'string' || entry.commit === '') return 'missing commit'
  if (stampMsOf(entry.committedAt) === null) return 'missing or unreadable committedAt'
  if (!isRecord(entry.metrics)) return 'missing metrics'
  return null
}

function finiteMetricsOf(metrics, lineNumber, problems) {
  const kept = {}
  for (const [id, value] of Object.entries(metrics)) {
    if (Number.isFinite(value)) kept[id] = value
    else problems.push(`history line ${lineNumber}: ${id} is not a finite number, value dropped`)
  }
  return kept
}

function runOfEntry(entry, lineNumber, metrics) {
  return {
    line: lineNumber,
    commit: entry.commit,
    shortSha: shortShaOf(entry.commit),
    committedAt: entry.committedAt,
    committedAtMs: stampMsOf(entry.committedAt),
    measuredAt: stringOrNull(entry.measuredAt),
    measuredAtMs: stampMsOf(entry.measuredAt) ?? 0,
    source: stringOrNull(entry.source) ?? 'unknown',
    machine: stringOrNull(entry.machine),
    env: stringOrNull(entry.env),
    load: Number.isFinite(entry.load) ? entry.load : null,
    runs: Number.isFinite(entry.runs) ? entry.runs : null,
    note: stringOrNull(entry.note),
    metrics,
  }
}

// A bad line is reported and skipped, never fatal: the dashboard must build from whatever the
// history holds. A single non-finite value drops that value, not the run's other metrics.
function runOfLine(line, lineNumber, problems) {
  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    problems.push(`history line ${lineNumber}: invalid JSON, skipped`)
    return null
  }
  const problem = problemOfEntry(entry)
  if (problem) {
    problems.push(`history line ${lineNumber}: ${problem}, skipped`)
    return null
  }
  const metrics = finiteMetricsOf(entry.metrics, lineNumber, problems)
  if (Object.keys(metrics).length === 0) {
    problems.push(`history line ${lineNumber}: no finite metric value, skipped`)
    return null
  }
  return runOfEntry(entry, lineNumber, metrics)
}

/** Commit-time order, then measurement time; stable, so equal stamps keep their file order. */
export function orderRuns(runs) {
  return [...runs].sort(
    (a, b) => a.committedAtMs - b.committedAtMs || a.measuredAtMs - b.measuredAtMs,
  )
}

/** history.ndjson text -> `{ runs, problems }`, runs ordered, problems one sentence per bad line. */
export function parsePerfHistory(text) {
  const problems = []
  const runs = []
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return
    const run = runOfLine(line, index + 1, problems)
    if (run) runs.push(run)
  })
  return { runs: orderRuns(runs), problems }
}

function definitionOf(id, entry) {
  return {
    id,
    label: stringOrNull(entry.label) ?? id,
    unit: stringOrNull(entry.unit) ?? '',
    group: stringOrNull(entry.group) ?? UNREGISTERED_GROUP,
    better: entry.better === 'higher' ? 'higher' : 'lower',
    budget: Number.isFinite(entry.budget) ? entry.budget : null,
    source: stringOrNull(entry.source),
    registered: true,
  }
}

/** metrics.json (parsed) -> `{ groups, metrics }` with every field defaulted. */
export function readPerfRegistry(registry) {
  const groups = Array.isArray(registry?.groups) ? registry.groups.filter(isNonEmptyString) : []
  const metrics = {}
  for (const [id, entry] of Object.entries(isRecord(registry?.metrics) ? registry.metrics : {})) {
    if (isRecord(entry)) metrics[id] = definitionOf(id, entry)
  }
  return { groups, metrics }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value !== ''
}

function unregisteredDefinitionOf(id) {
  return {
    id,
    label: id,
    unit: '',
    group: UNREGISTERED_GROUP,
    better: 'lower',
    budget: null,
    source: null,
    registered: false,
  }
}

function isOverBudget(value, budget, better) {
  if (budget === null) return null
  return better === 'lower' ? value > budget : value < budget
}

/** The change from `reference` to `value`, judged by which direction is the good one. */
export function deltaOf(value, reference, better) {
  const absolute = value - reference
  const percent = reference === 0 ? null : (absolute / Math.abs(reference)) * 100
  const improves = better === 'lower' ? absolute < 0 : absolute > 0
  const direction = absolute === 0 ? 'flat' : improves ? 'good' : 'bad'
  return { absolute, percent, direction }
}

function pointOf(run, id, definition) {
  const value = run.metrics[id]
  return {
    commit: run.commit,
    shortSha: run.shortSha,
    committedAt: run.committedAt,
    measuredAt: run.measuredAt,
    source: run.source,
    load: run.load,
    value,
    overBudget: isOverBudget(value, definition.budget, definition.better),
  }
}

export function niceCeilingOf(max) {
  if (!(max > 0)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const fraction = max / magnitude
  const nice = NICE_FRACTIONS.find((f) => f >= fraction - 1e-9) ?? 10
  return Number((nice * magnitude).toPrecision(12))
}

function yMaxOf(points, budget) {
  const values = points.map((p) => p.value)
  if (budget !== null) values.push(budget)
  return niceCeilingOf(Math.max(...values) * HEADROOM)
}

function chartOf(definition, runs) {
  const points = runs
    .filter((run) => definition.id in run.metrics)
    .map((run) => pointOf(run, definition.id, definition))
  const latest = points.at(-1)
  const previous = points.at(-2)
  const first = points[0]
  return {
    ...definition,
    figureId: figureIdOf(definition.id),
    points,
    latest: latest.value,
    latestOverBudget: latest.overBudget,
    deltaFromPrevious: previous ? deltaOf(latest.value, previous.value, definition.better) : null,
    deltaFromFirst:
      points.length > 1 ? deltaOf(latest.value, first.value, definition.better) : null,
    yMax: yMaxOf(points, definition.budget),
  }
}

// Registry order for registered ids, then first appearance in the history for the rest.
function metricIdsOf(runs, registry) {
  const seen = new Set(runs.flatMap((run) => Object.keys(run.metrics)))
  const registered = Object.keys(registry.metrics).filter((id) => seen.has(id))
  const unregistered = [...seen].filter((id) => !(id in registry.metrics))
  return { registered, unregistered }
}

function groupNamesOf(charts, registry) {
  const names = [...registry.groups]
  for (const chart of charts) {
    if (chart.registered && !names.includes(chart.group)) names.push(chart.group)
  }
  if (charts.some((chart) => !chart.registered)) names.push(UNREGISTERED_GROUP)
  return names
}

function groupCharts(charts, registry) {
  return groupNamesOf(charts, registry)
    .map((name) => ({ name, charts: charts.filter((chart) => chart.group === name) }))
    .filter((group) => group.charts.length > 0)
}

function latestMeasuredOf(runs) {
  let latest = null
  for (const run of runs) {
    if (!latest || run.measuredAtMs >= latest.measuredAtMs) latest = run
  }
  return latest
}

function chartsOf(runs, registry) {
  const ids = metricIdsOf(runs, registry)
  return {
    charts: [
      ...ids.registered.map((id) => chartOf(registry.metrics[id], runs)),
      ...ids.unregistered.map((id) => chartOf(unregisteredDefinitionOf(id), runs)),
    ],
    unregistered: ids.unregistered,
  }
}

/** How far the latest value is from its budget, as a share of the budget; negative means over. */
export function headroomPercentOf(value, budget, better) {
  if (budget === null || budget === 0) return null
  const room = better === 'lower' ? budget - value : value - budget
  return (room / Math.abs(budget)) * 100
}

function budgetRowOf(chart) {
  const latest = chart.points.at(-1)
  return {
    id: chart.id,
    label: chart.label,
    unit: chart.unit,
    figureId: chart.figureId,
    better: chart.better,
    budget: chart.budget,
    latest: chart.latest,
    overBudget: chart.latestOverBudget,
    headroomPercent: headroomPercentOf(chart.latest, chart.budget, chart.better),
    deltaFromPrevious: chart.deltaFromPrevious,
    runsOverBudget: chart.points.filter((p) => p.overBudget).length,
    runCount: chart.points.length,
    latestRun: {
      commit: latest.commit,
      shortSha: latest.shortSha,
      measuredAt: latest.measuredAt,
      source: latest.source,
      load: latest.load,
    },
  }
}

/** Every metric with a budget, judged on its latest value: over budget first, then least room. */
export function budgetsOf(charts) {
  const rows = charts.filter((chart) => chart.budget !== null).map(budgetRowOf)
  const room = (row) => row.headroomPercent ?? (row.overBudget ? -Infinity : Infinity)
  return rows.sort((a, b) => Number(b.overBudget) - Number(a.overBudget) || room(a) - room(b))
}

function recentRunsOf(runs, budgetsById) {
  return [...runs]
    .sort((a, b) => b.measuredAtMs - a.measuredAtMs || b.line - a.line)
    .slice(0, RECENT_RUN_COUNT)
    .map((run) => ({
      commit: run.commit,
      shortSha: run.shortSha,
      measuredAt: run.measuredAt,
      source: run.source,
      load: run.load,
      env: run.env,
      note: run.note,
      metricCount: Object.keys(run.metrics).length,
      overBudget: Object.entries(run.metrics)
        .filter(([id, value]) => {
          const def = budgetsById.get(id)
          return def && isOverBudget(value, def.budget, def.better)
        })
        .map(([id]) => id),
    }))
}

/**
 * The whole section's model from the two committed files.
 * @param {{ historyText: string, registry: unknown, repo: string }} inputs
 */
export function buildPerfOverview({ historyText, registry, repo }) {
  const history = parsePerfHistory(historyText)
  const known = readPerfRegistry(registry)
  const { charts, unregistered } = chartsOf(history.runs, known)
  const budgets = budgetsOf(charts)
  const over = budgets.filter((row) => row.overBudget).length
  const budgetsById = new Map(budgets.map((row) => [row.id, row]))
  return {
    repo,
    runCount: history.runs.length,
    metricCount: charts.length,
    runs: history.runs,
    latestRun: latestMeasuredOf(history.runs),
    budgets,
    budgetCounts: { total: budgets.length, over, within: budgets.length - over },
    recentRuns: recentRunsOf(history.runs, budgetsById),
    groups: groupCharts(charts, known),
    unregistered,
    problems: history.problems,
  }
}
