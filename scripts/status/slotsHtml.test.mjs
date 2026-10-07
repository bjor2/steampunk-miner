import { describe, expect, it } from 'vitest'
import { readSlotsSnapshot, slotsFreshness } from './slots.mjs'
import { ageOf, renderSlotsFailure, renderSlotsOverview, renderSlotsPanel } from './slotsHtml.mjs'

const UPDATED = '2026-10-06T20:50:00Z'
const NOW_MS = Date.parse(UPDATED) + 3 * 60_000
const LONG_AGO_MS = Date.parse(UPDATED) + 3 * 3_600_000

function freeGrok(slot) {
  return { slot, state: 'free', ticket: null, since: null }
}

function freeClaude(slot) {
  return { slot: `C${slot}`, state: 'free', ticket: null, grok_slot: null, kind: null, since: null }
}

function allFree() {
  return {
    updated_at: UPDATED,
    grok: [1, 2, 3, 4, 5, 6, 7, 8].map(freeGrok),
    claude: [1, 2, 3, 4].map((slot) => ({ ...freeClaude(slot), slot })),
  }
}

function mixed() {
  return {
    updated_at: UPDATED,
    caps: { dev: 2, planner: 2 },
    accounts: [
      {
        id: 'A1',
        account: 1,
        name: 'Claude Max 1',
        email: 'someone@example.com',
        enabled: true,
        slots: [
          { slot: 'C1', state: 'busy', ticket: 194, grok_slot: 3, kind: 'dev', since: UPDATED },
          {
            slot: 'C2',
            state: 'busy',
            ticket: null,
            grok_slot: null,
            kind: 'external',
            since: UPDATED,
            pid: 4242,
            cwd: '/workspace/perf',
          },
        ],
      },
      {
        id: 'A2',
        account: 2,
        name: 'Claude Max 2',
        enabled: false,
        reason: 'not signed in',
        slots: [3, 4].map((n) => ({ ...freeClaude(n), state: 'disabled' })),
      },
    ],
    grok: [
      freeGrok(1),
      { slot: 2, state: 'planner', ticket: 191, since: UPDATED, room: 'a7c87ace-room' },
      { slot: 3, state: 'dev', ticket: 194, since: UPDATED, claude_slot: 1 },
    ],
    claude: [],
  }
}

function panelOf(raw, nowMs = NOW_MS) {
  const model = readSlotsSnapshot(raw)
  const freshness = slotsFreshness(model, [], nowMs)
  return renderSlotsPanel(model, {
    repo: 'bjor2/steampunk-miner',
    nowMs,
    freshness,
    titles: { 194: 'Build: <slots>' },
  })
}

describe('slots tab html', () => {
  it('shows every slot of an all-free snapshot as free with no ticket', () => {
    const html = panelOf(allFree())

    expect(html.match(/sl-free/g)).toHaveLength(12)
    expect(html).toContain('0/8 busy')
    expect(html).not.toContain('/issues/')
  })

  it('links tickets and draws the Grok to Claude pairing on both sides', () => {
    const html = panelOf(mixed())

    expect(html).toContain('href="https://github.com/bjor2/steampunk-miner/issues/194"')
    expect(html).toContain('href="https://github.com/bjor2/steampunk-miner/issues/191"')
    expect(html).toContain('G3 ↔ C1 (A1)')
    expect(html).toContain('C1 ↔ G3')
    expect(html).toContain('Build: &lt;slots&gt;')
  })

  it('splits the Claude pool per account and marks a disabled account', () => {
    const html = panelOf(mixed())

    expect(html).toContain('A1 · Claude Max 1')
    expect(html).toContain('A1 2/2 · A2 disabled')
    expect(html).toContain('not signed in')
  })

  it('warns on a Claude slot whose Grok slot is free', () => {
    const raw = mixed()
    raw.grok[2] = freeGrok(3)

    expect(panelOf(raw)).toContain('G free')
  })

  it('puts no pid, path, room or email on the page', () => {
    const html =
      panelOf(mixed()) + renderSlotsOverview(readSlotsSnapshot(mixed()), { isStale: false })

    for (const secret of ['4242', '/workspace', 'a7c87ace', 'example.com']) {
      expect(html).not.toContain(secret)
    }
  })

  it('says STALE when the loop has not confirmed the snapshot for a long time', () => {
    expect(panelOf(mixed(), LONG_AGO_MS)).toContain('STALE')
    expect(panelOf(mixed())).not.toContain('STALE')
  })

  it('shows why a malformed snapshot is not drawn', () => {
    const model = readSlotsSnapshot({ grok: [], claude: 'four' })

    expect(renderSlotsFailure(model.error)).toContain(
      'slots.json is malformed: `claude` is not a list',
    )
  })

  it('sums both pools and Claude per account in the header line', () => {
    const model = readSlotsSnapshot(mixed())

    expect(renderSlotsOverview(model, { isStale: true })).toContain(
      'Grok <b>2/3</b> (dev 1/2, planner 1/2) · Claude <b>2/4</b> (A1 2/2 · A2 disabled) <span class="badge stale">STALE</span>',
    )
  })

  it('writes ages in seconds, minutes, hours and days', () => {
    const at = Date.parse(UPDATED)

    expect([30_000, 300_000, 5_400_000, 172_800_000].map((ms) => ageOf(UPDATED, at + ms))).toEqual([
      '30s ago',
      '5m ago',
      '1.5h ago',
      '2d ago',
    ])
  })
})

describe('gate tokens and the box Tester (2026-10-07)', () => {
  const view = (model) => ({
    repo: 'o/r',
    nowMs: NOW_MS,
    freshness: slotsFreshness(model, [], NOW_MS),
  })
  const withTester = (tester) => {
    const raw = allFree()
    raw.claude[0] = {
      slot: 1,
      state: 'busy',
      kind: 'aux',
      label: 'tester-triage',
      ticket: null,
      grok_slot: null,
      since: UPDATED,
    }
    return readSlotsSnapshot({ ...raw, gate: { busy: 2, max: 3 }, tester })
  }

  it('shows the gate tokens in use and the tester holding a gate token and a Claude slot', () => {
    const model = withTester({
      state: 'running',
      phase: 'slow',
      since: UPDATED,
      holds_gate: true,
      claude_slot: 1,
      feature: 90,
      queue: [{ feature: 214 }],
    })
    const html = renderSlotsPanel(model, view(model))
    expect(html).toContain('feature <a href="https://github.com/o/r/issues/90">#90</a>')
    expect(html).toContain('1 feature(s) awaiting test')
    expect(html).toContain('Gate tokens <b>2/3</b> busy')
    expect(html).toContain('holds a gate token + Claude slot C1')
    expect(html).toContain('aux · tester-triage')
  })

  it('shows an idle tester and the main-red pause', () => {
    const model = withTester({ state: 'idle', last_run: UPDATED, main_red_sha: 'abc1234' })
    const html = renderSlotsPanel(model, view(model))
    expect(html).toContain('sl-free">idle')
    expect(html).toContain('MAIN RED')
  })

  it('keeps working on a snapshot without gate or tester', () => {
    const model = readSlotsSnapshot(allFree())
    expect(model.gate).toBeNull()
    expect(renderSlotsPanel(model, view(model))).toContain(
      'Tester: <span class="muted">not published',
    )
  })
})
