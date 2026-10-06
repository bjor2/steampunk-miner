import { describe, expect, it } from 'vitest'
import {
  SLOTS_STALE_AFTER_MIN,
  claudeUsageByAccount,
  heartbeatsOfLoop,
  readSlotsSnapshot,
  slotsFreshness,
  slotsTabBadge,
} from './slots.mjs'

const UPDATED = '2026-10-06T22:50:27+02:00'
const MINUTE_MS = 60_000

function freeGrok(slot) {
  return { slot, state: 'free', ticket: null, since: null }
}

function freeClaude(slot) {
  return { slot: `C${slot}`, state: 'free', ticket: null, grok_slot: null, kind: null, since: null }
}

function account(number, slots, extra = {}) {
  return {
    id: `A${number}`,
    account: number,
    name: `Claude Max ${number}`,
    enabled: true,
    slots,
    ...extra,
  }
}

function allFreeV1() {
  return {
    updated_at: UPDATED,
    caps: { grok: 8, claude: 4, dev: 4, planner: 4 },
    grok: [1, 2, 3, 4, 5, 6, 7, 8].map(freeGrok),
    claude: [1, 2, 3, 4].map((slot) => ({
      slot,
      state: 'free',
      ticket: null,
      grok_slot: null,
      since: null,
    })),
  }
}

// What the box copy looks like before the driver sanitises it: pids, paths, a room and an email.
function mixedV2() {
  return {
    updated_at: UPDATED,
    caps: { grok: 4, claude: 4, dev: 2, planner: 2 },
    accounts: [
      account(
        1,
        [
          {
            slot: 'C1',
            state: 'busy',
            ticket: 194,
            grok_slot: 1,
            kind: 'dev',
            since: '2026-10-06T22:29:00+02:00',
          },
          {
            slot: 'C2',
            state: 'busy',
            ticket: null,
            grok_slot: null,
            kind: 'external',
            since: UPDATED,
            pid: 4242,
            cwd: '/workspace/x',
          },
        ],
        { email: 'someone@example.com', label: 'account 1 (default ~/.claude login)' },
      ),
      account(2, [freeClaude(3), freeClaude(4)]),
    ],
    grok: [
      { slot: 1, state: 'dev', ticket: 194, since: '2026-10-06T22:29:00+02:00', claude_slot: 1 },
      { slot: 2, state: 'planner', ticket: 191, since: UPDATED, map: 139, room: 'a7c87ace' },
      freeGrok(3),
      freeGrok(4),
    ],
    claude: [],
    claude_external: [{ pid: 4242, cwd: '/workspace/x' }],
  }
}

describe('slots snapshot', () => {
  it('reads an all-free v1 snapshot as one Claude pool with nothing used', () => {
    const model = readSlotsSnapshot(allFreeV1())

    expect(model.isSplitByAccount).toBe(false)
    expect(model.accounts).toHaveLength(1)
    expect(model.totals.grok).toMatchObject({ size: 8, used: 0, devCap: 4, plannerCap: 4 })
    expect(model.totals.claude).toMatchObject({ size: 4, used: 0 })
    expect(slotsTabBadge(model)).toBe('0/8 · 0/4')
  })

  it('counts dev and planner Grok slots and busy Claude slots per account', () => {
    const model = readSlotsSnapshot(mixedV2())

    expect(model.totals.grok).toMatchObject({ size: 4, used: 2, dev: 1, planner: 1 })
    expect(model.accounts.map((a) => [a.id, a.used, a.size])).toEqual([
      ['A1', 2, 2],
      ['A2', 0, 2],
    ])
    expect(slotsTabBadge(model)).toBe('2/4 · 2/4')
    expect(claudeUsageByAccount(model)).toBe('A1 2/2 · A2 0/2')
  })

  it('links a Grok slot to the Claude slot and account it runs', () => {
    const [first, planner] = readSlotsSnapshot(mixedV2()).grok

    expect(first.claude).toEqual({ slot: 'C1', account: 'A1' })
    expect(planner.claude).toBeNull()
  })

  it('flags a busy Claude slot whose Grok slot is free', () => {
    const raw = mixedV2()
    raw.grok[0] = freeGrok(1)

    const [c1, external] = readSlotsSnapshot(raw).accounts[0].slots

    expect(c1.isGrokSlotFree).toBe(true)
    expect(external.isGrokSlotFree).toBe(false)
  })

  it('keeps no pid, path, room, label or email from the box copy', () => {
    const text = JSON.stringify(readSlotsSnapshot(mixedV2()))

    for (const secret of ['4242', '/workspace', 'a7c87ace', '~/.claude', 'example.com']) {
      expect(text).not.toContain(secret)
    }
  })

  it('names an account from its number when its name looks private', () => {
    const raw = mixedV2()
    raw.accounts[0].name = 'someone@example.com'

    expect(readSlotsSnapshot(raw).accounts[0].name).toBe('Claude Max 1')
  })

  it('marks a disabled account and leaves its slots out of the enabled count', () => {
    const raw = mixedV2()
    raw.accounts[1] = account(
      2,
      [3, 4].map((n) => ({ ...freeClaude(n), state: 'disabled' })),
      {
        enabled: false,
        reason: 'not signed in',
      },
    )

    const model = readSlotsSnapshot(raw)

    expect(model.accounts[1]).toMatchObject({ isEnabled: false, reason: 'not signed in' })
    expect(model.totals.claude).toMatchObject({ size: 4, enabled: 2, used: 2 })
    expect(claudeUsageByAccount(model)).toBe('A1 2/2 · A2 disabled')
  })

  it.each([
    ['a list', []],
    ['null', null],
    ['a snapshot without grok', { claude: [] }],
    ['a snapshot whose claude is not a list', { grok: [], claude: {} }],
    ['a snapshot whose accounts are not a list', { grok: [], claude: [], accounts: 'A1' }],
  ])('refuses %s as malformed', (_name, raw) => {
    expect(readSlotsSnapshot(raw).error).toMatch(/^slots\.json is malformed/)
  })

  it('reads unknown states and bad tickets as free and missing', () => {
    const raw = allFreeV1()
    raw.grok[0] = { slot: 1, state: 'zombie', ticket: '12; drop', since: 'yesterday' }

    expect(readSlotsSnapshot(raw).grok[0]).toMatchObject({
      state: 'free',
      ticket: null,
      since: null,
    })
  })
})

describe('slots freshness', () => {
  const model = readSlotsSnapshot(allFreeV1())
  const updatedMs = Date.parse(UPDATED)

  it('is fresh while the snapshot is younger than the stale limit', () => {
    expect(slotsFreshness(model, [], updatedMs + 5 * MINUTE_MS)).toMatchObject({
      ageMin: 5,
      isStale: false,
    })
  })

  it('goes stale when neither the snapshot nor a loop heartbeat is recent', () => {
    const now = updatedMs + (SLOTS_STALE_AFTER_MIN + 1) * MINUTE_MS

    expect(slotsFreshness(model, [], now).isStale).toBe(true)
  })

  it('stays fresh on an unchanged snapshot while the loop keeps sending heartbeats', () => {
    const heartbeat = new Date(updatedMs + 60 * MINUTE_MS).toISOString()

    expect(slotsFreshness(model, [heartbeat], updatedMs + 62 * MINUTE_MS)).toMatchObject({
      ageMin: 2,
      isStale: false,
    })
  })

  it('takes the heartbeats of the build loop and its slots only', () => {
    const loops = {
      entries: {
        'steampunk-loop': { loop: 'steampunk-loop', updated_at: 'a' },
        'steampunk-loop/3': { loop: 'steampunk-loop', updated_at: 'b' },
        'perf-loop': { loop: 'perf-loop', updated_at: 'c' },
      },
    }

    expect(heartbeatsOfLoop(loops)).toEqual(['a', 'b'])
  })
})
