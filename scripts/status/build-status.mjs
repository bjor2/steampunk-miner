#!/usr/bin/env node
// Builds the status dashboard (dist/status/) that the Pages workflow deploys next to the game:
// the issue trees (sub-issue hierarchy) from GraphQL, the loop state from loops.json on the
// orphan `loop-status` branch, the last run of each workflow, the Performance charts from
// the committed docs/perf/ files (static HTML + SVG, no script), the "Where the time goes"
// section of the Issue trees tab from the committed docs/metrics/tickets/ files (#134), and the
// game feature tree from docs/features/features.json joined with the live issue states, with
// those ticket times rolled up per feature and area (#135) over each ticket's claimed-to-done
// window, under a "Tickets closed over time" chart from the same issue list (#138). Static output,
// no server.
//
//   node scripts/status/build-status.mjs [--out dist/status]
//
// Auth: GITHUB_TOKEN / GH_TOKEN when set (Actions), else the logged-in `gh` CLI (local runs).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHASE_CATEGORIES } from '../metrics/phaseCategories.mjs'
import { annotateFeatures, validateFeatures } from './features.mjs'
import {
  renderFeatureTimeFailure,
  renderFeatureTimeOverview,
  withFeatureTimeBars,
} from './featureTimeHtml.mjs'
import { buildPerfOverview } from './perfOverview.mjs'
import { renderPerfOverview, renderPerfOverviewFailure } from './perfOverviewHtml.mjs'
import { buildTicketTimeOverview } from './ticketTimeOverview.mjs'
import { renderTicketTimeFailure, renderTicketTimeOverview } from './ticketTimeOverviewHtml.mjs'
import { buildTicketsClosedOverTime } from './ticketsClosed.mjs'
import { renderTicketsClosedFailure, renderTicketsClosedOverTime } from './ticketsClosedHtml.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
// The Pages job checks out with depth 1, so the perf files are read, never asked of git.
const PERF_DIR = join(HERE, '..', '..', 'docs', 'perf')
const PERF_PLACEHOLDER = '<!-- perf-overview -->'
// Written on the build box by `npm run metrics:ticket`; the Pages job only reads them.
const TICKET_TIME_DIR = join(HERE, '..', '..', 'docs', 'metrics', 'tickets')
const TICKET_TIME_PLACEHOLDER = '<!-- ticket-time -->'
const FEATURE_TIME_PLACEHOLDER = '<!-- feature-time -->'
const TICKETS_CLOSED_PLACEHOLDER = '<!-- tickets-closed -->'
const DAY_LENGTH = 'YYYY-MM-DD'.length
const FEATURES_FILE = 'docs/features/features.json'
const FEATURES_PATH = join(HERE, '..', '..', FEATURES_FILE)
const REPO = process.env.GITHUB_REPOSITORY || 'bjor2/steampunk-miner'
const [OWNER, NAME] = REPO.split('/')
const LOOP_BRANCH = process.env.LOOP_STATUS_BRANCH || 'loop-status'
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const API = process.env.GITHUB_API_URL || 'https://api.github.com'
const outArg = process.argv.indexOf('--out')
const OUT = outArg > 0 ? process.argv[outArg + 1] : 'dist/status'

// Workflows shown on the page; the ones with `loop` also become a loop entry (state from the
// last run), so a scheduled workflow is visible next to the agent loops without any reporting.
const WORKFLOWS = [
  { file: 'balance-planets.yml', loop: 'balance-planets', staleAfterMin: 26 * 60 },
  { file: 'ci.yml' },
  { file: 'e2e.yml' },
  { file: 'pages.yml' },
]

async function rest(path, { raw = false, allow404 = false } = {}) {
  if (!TOKEN) {
    try {
      const args = ['api', path]
      if (raw) args.push('-H', 'Accept: application/vnd.github.raw')
      return JSON.parse(
        execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      )
    } catch (err) {
      if (allow404 && String(err.stderr).includes('404')) return null
      throw err
    }
  }
  const res = await fetch(`${API}/${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (allow404 && res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function graphql(query, variables) {
  if (!TOKEN) {
    const args = ['api', 'graphql', '-f', `query=${query}`]
    for (const [k, v] of Object.entries(variables)) {
      if (v !== null) args.push(typeof v === 'string' ? '-f' : '-F', `${k}=${v}`)
    }
    const json = JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 << 20 }))
    if (json.errors) throw new Error(JSON.stringify(json.errors))
    return json.data
  }
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors)
    throw new Error(`graphql: ${res.status} ${JSON.stringify(json.errors ?? json)}`)
  return json.data
}

const ISSUES_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 50, after: $cursor, orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url state stateReason createdAt updatedAt closedAt
        labels(first: 30) { nodes { name color } }
        assignees(first: 10) { nodes { login } }
        parent { number }
        subIssuesSummary { total completed percentCompleted }
        subIssues(first: 100) { nodes { number } }
        blockedBy(first: 30) { nodes { number state title } }
        blocking(first: 30) { nodes { number state } }
      }
    }
  }
}`

async function fetchIssues() {
  const issues = []
  let cursor = null
  for (;;) {
    const data = await graphql(ISSUES_QUERY, { owner: OWNER, name: NAME, cursor })
    const page = data.repository.issues
    for (const n of page.nodes) {
      issues.push({
        number: n.number,
        title: n.title,
        url: n.url,
        state: n.state,
        stateReason: n.stateReason,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        closedAt: n.closedAt,
        labels: n.labels.nodes.map((l) => ({ name: l.name, color: l.color })),
        assignees: n.assignees.nodes.map((a) => a.login),
        parent: n.parent?.number ?? null,
        children: n.subIssues.nodes.map((c) => c.number),
        summary: n.subIssuesSummary,
        blockedBy: n.blockedBy.nodes,
        blocking: n.blocking.nodes.map((b) => b.number),
      })
    }
    if (!page.pageInfo.hasNextPage) break
    cursor = page.pageInfo.endCursor
  }
  return issues
}

async function fetchLoops() {
  try {
    const doc = await rest(`repos/${REPO}/contents/loops.json?ref=${LOOP_BRANCH}`, {
      raw: true,
      allow404: true,
    })
    return doc ?? { schema: 1, entries: {}, events: [] }
  } catch (err) {
    console.warn(`loops.json unavailable: ${err.message}`)
    return { schema: 1, entries: {}, events: [], error: String(err.message) }
  }
}

async function fetchWorkflows() {
  const out = []
  for (const wf of WORKFLOWS) {
    try {
      const data = await rest(`repos/${REPO}/actions/workflows/${wf.file}/runs?per_page=1`)
      const run = data.workflow_runs?.[0] ?? null
      out.push({
        ...wf,
        name: run?.name ?? wf.file,
        url: `https://github.com/${REPO}/actions/workflows/${wf.file}`,
        run: run && {
          id: run.id,
          url: run.html_url,
          status: run.status,
          conclusion: run.conclusion,
          event: run.event,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
        },
      })
    } catch (err) {
      out.push({ ...wf, name: wf.file, error: String(err.message) })
    }
  }
  return out
}

// A workflow with `loop` set becomes a loop entry: running -> working, failed -> blocked.
function workflowLoopEntries(workflows) {
  const entries = {}
  for (const wf of workflows) {
    if (!wf.loop) continue
    const run = wf.run
    let state = 'idle'
    let note = 'no runs yet'
    if (run) {
      if (run.status !== 'completed') {
        state = 'working'
        note = `run ${run.status} (${run.event})`
      } else {
        state = run.conclusion === 'success' || run.conclusion === 'skipped' ? 'idle' : 'blocked'
        note = `last run ${run.conclusion} (${run.event})`
      }
    }
    entries[wf.loop] = {
      loop: wf.loop,
      slot: null,
      state,
      issue: null,
      note,
      updated_at: run?.updatedAt ?? null,
      stale_after_min: wf.staleAfterMin ?? null,
      link: run?.url ?? wf.url,
      source: 'actions',
    }
  }
  return entries
}

function readPerfInputs() {
  return {
    historyText: readFileSync(join(PERF_DIR, 'history.ndjson'), 'utf8'),
    registry: JSON.parse(readFileSync(join(PERF_DIR, 'metrics.json'), 'utf8')),
    repo: REPO,
  }
}

function warnPerfProblems(model) {
  for (const id of model.unregistered) {
    console.warn(`perf: metric "${id}" is not in docs/perf/metrics.json (charted as is)`)
  }
  for (const problem of model.problems) console.warn(`perf: ${problem}`)
}

// A broken perf file or renderer must not take the loops and issue trees down with it: the
// section then shows the error and the build goes on.
function buildPerfSection() {
  try {
    const model = buildPerfOverview(readPerfInputs())
    warnPerfProblems(model)
    return { model, html: renderPerfOverview(model) }
  } catch (err) {
    console.warn(`perf overview failed: ${err.message}`)
    return { model: { error: String(err.message) }, html: renderPerfOverviewFailure(err.message) }
  }
}

function readTicketTimeFiles() {
  if (!existsSync(TICKET_TIME_DIR)) return []
  return readdirSync(TICKET_TIME_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(TICKET_TIME_DIR, name), 'utf8') }))
}

// Like the perf section: a broken ticket file or renderer shows its error in the section only.
function buildTicketTimeSection() {
  try {
    const model = buildTicketTimeOverview({ files: readTicketTimeFiles(), repo: REPO })
    for (const problem of model.problems) console.warn(`ticket time: ${problem}`)
    return { model, html: renderTicketTimeOverview(model) }
  } catch (err) {
    console.warn(`ticket time overview failed: ${err.message}`)
    return { model: { error: String(err.message) }, html: renderTicketTimeFailure(err.message) }
  }
}

async function fetchLastCommitOf(path) {
  try {
    const commits = await rest(`repos/${REPO}/commits?path=${encodeURIComponent(path)}&per_page=1`)
    const c = commits?.[0]
    return c
      ? {
          sha: c.sha,
          url: c.html_url,
          date: c.commit.committer?.date ?? c.commit.author?.date ?? null,
          message: c.commit.message.split('\n')[0],
        }
      : null
  } catch (err) {
    console.warn(`last commit of ${path} unavailable: ${err.message}`)
    return null
  }
}

// A broken feature file must not take the rest of the page down: the Features tab then lists
// the problems instead of the tree.
function buildFeatures(issues, lastCommit, measuredTickets) {
  const base = { file: FEATURES_FILE, lastCommit }
  try {
    const doc = JSON.parse(readFileSync(FEATURES_PATH, 'utf8'))
    const problems = validateFeatures(doc)
    if (problems.length) {
      for (const p of problems) console.warn(`features: ${p}`)
      return { ...base, error: `${FEATURES_FILE} is invalid`, problems }
    }
    return { ...base, ...annotateFeatures(doc, issues, measuredTickets) }
  } catch (err) {
    console.warn(`features failed: ${err.message}`)
    return { ...base, error: String(err.message), problems: [] }
  }
}

function featureTimeProblemOf(features, ticketTimeModel) {
  if (features.error) return `the feature tree failed: ${features.error}`
  if (ticketTimeModel.error) return `the ticket time files failed: ${ticketTimeModel.error}`
  return null
}

// Like the other sections: a failed roll-up shows its error above the tree, the tree still renders.
function buildFeatureTimeSection(features, ticketTimeModel) {
  const problem = featureTimeProblemOf(features, ticketTimeModel)
  if (problem) return { features, html: renderFeatureTimeFailure(problem) }
  try {
    const areas = withFeatureTimeBars(features.areas, PHASE_CATEGORIES)
    const html = renderFeatureTimeOverview(features, PHASE_CATEGORIES, REPO)
    return { features: { ...features, areas }, html }
  } catch (err) {
    console.warn(`feature time failed: ${err.message}`)
    return { features, html: renderFeatureTimeFailure(err.message) }
  }
}

// Like the other sections: a failed chart shows its error, the tree still renders.
function buildTicketsClosedSection(issues, ticketTimeModel) {
  try {
    const model = buildTicketsClosedOverTime({
      issues,
      measuredTickets: ticketTimeModel.tickets ?? [],
      today: new Date().toISOString().slice(0, DAY_LENGTH),
    })
    return { model, html: renderTicketsClosedOverTime(model) }
  } catch (err) {
    console.warn(`tickets closed failed: ${err.message}`)
    return { model: { error: String(err.message) }, html: renderTicketsClosedFailure(err.message) }
  }
}

// /status/features/ and /status/performance/ are short links to their tabs.
const SHORT_LINKS = { features: 'Feature tree', performance: 'Performance' }

function shortLinkPage(tab, title) {
  return `<!doctype html>
<meta charset="utf-8" />
<title>Steampunk Miner · ${title}</title>
<meta http-equiv="refresh" content="0; url=../#${tab}" />
<link rel="canonical" href="../#${tab}" />
<p>Moved to <a href="../#${tab}">the status page's ${title} tab</a>.</p>
`
}

function withSection(page, placeholder, html) {
  if (!page.includes(placeholder)) {
    throw new Error(`index.html lacks the ${placeholder} placeholder`)
  }
  return page.replace(placeholder, () => html)
}

function pageWithSections(perfHtml, ticketTimeHtml) {
  const page = readFileSync(join(HERE, 'index.html'), 'utf8')
  return withSection(
    withSection(page, PERF_PLACEHOLDER, perfHtml),
    TICKET_TIME_PLACEHOLDER,
    ticketTimeHtml,
  )
}

// The committed-file sections first, before any GitHub call, so their bugs top the log.
const perf = buildPerfSection()
const ticketTime = buildTicketTimeSection()
const pageBeforeFeatures = pageWithSections(perf.html, ticketTime.html)

const [issues, loops, workflows, featuresCommit] = await Promise.all([
  fetchIssues(),
  fetchLoops(),
  fetchWorkflows(),
  fetchLastCommitOf(FEATURES_FILE),
])
const featureTime = buildFeatureTimeSection(
  buildFeatures(issues, featuresCommit, ticketTime.model.tickets ?? []),
  ticketTime.model,
)
const features = featureTime.features
const ticketsClosed = buildTicketsClosedSection(issues, ticketTime.model)
const page = withSection(
  withSection(pageBeforeFeatures, TICKETS_CLOSED_PLACEHOLDER, ticketsClosed.html),
  FEATURE_TIME_PLACEHOLDER,
  featureTime.html,
)
const server = process.env.GITHUB_SERVER_URL || 'https://github.com'
const runId = process.env.GITHUB_RUN_ID
const status = {
  schema: 1,
  repo: REPO,
  generatedAt: new Date().toISOString(),
  run: runId
    ? {
        id: runId,
        url: `${server}/${REPO}/actions/runs/${runId}`,
        event: process.env.GITHUB_EVENT_NAME ?? null,
        sha: process.env.GITHUB_SHA ?? null,
      }
    : null,
  workflowUrl: `${server}/${REPO}/actions/workflows/pages.yml`,
  pinned: [90],
  loopBranch: LOOP_BRANCH,
  issues,
  loops,
  workflowLoops: workflowLoopEntries(workflows),
  workflows,
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'status.json'), JSON.stringify(status))
writeFileSync(join(OUT, 'loops.json'), JSON.stringify(loops, null, 2))
writeFileSync(join(OUT, 'perf.json'), JSON.stringify(perf.model))
writeFileSync(join(OUT, 'ticket-time.json'), JSON.stringify(ticketTime.model))
writeFileSync(join(OUT, 'features.json'), JSON.stringify(features))
writeFileSync(join(OUT, 'index.html'), page)
for (const [tab, title] of Object.entries(SHORT_LINKS)) {
  mkdirSync(join(OUT, tab), { recursive: true })
  writeFileSync(join(OUT, tab, 'index.html'), shortLinkPage(tab, title))
}
for (const f of features.flagged ?? []) console.log(`features: check ${f.path}: ${f.reason}`)
console.log(
  `status: ${issues.length} issues, ${Object.keys(loops.entries ?? {}).length} loop entries, ` +
    `${workflows.length} workflows, ${perf.model.runCount ?? 0} perf runs / ` +
    `${perf.model.metricCount ?? 0} metrics / ${perf.model.budgetCounts?.over ?? '?'} over budget, ` +
    `${ticketTime.model.ticketCount ?? 0} ticket time files, ` +
    `${ticketsClosed.model.closedCount ?? '?'} tickets closed, ` +
    `${features.counts ? `${features.counts.features} features / ${features.counts.flagged} to check` : `features: ${features.error}`} -> ${OUT}`,
)
