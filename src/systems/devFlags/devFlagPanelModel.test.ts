import { describe, expect, it } from 'vitest'
import { DEV_FLAG_ROWS, type DevFlagRow } from '../../constants/devFlagRows'
import { AUTHORITY_DEV_FLAGS } from '../../constants/devFlags'
import { SHIPPED_CLIENT_DEV_FLAGS, withChosenClientFlags } from './clientDevFlags'
import { devFlagBadgeOf, OVER_SAVE_NOTE } from './devFlagBadge'
import { SHIPPED_DEV_FLAGS, type DevFlagId, type ShippedDevFlags } from './devFlagOverrides'
import {
  devFlagPanelModelOf,
  type DevFlagPanelRow,
  type DevFlagPanelSources,
} from './devFlagPanelModel'

// The debug flag panel and its badge (ticket 549, the TD ruling on #547 and the #548 ruling; VS 2,
// 4 and 5): built from the metadata table, client and authority apart, pending and read-only
// states, pair warnings, stale defaults, and a badge only while a flag is off its default.

const DEFAULT_SOURCES: DevFlagPanelSources = {
  authority: AUTHORITY_DEV_FLAGS,
  client: SHIPPED_CLIENT_DEV_FLAGS,
  isEverSet: false,
  isHost: true,
  overrides: {},
  changedDefaults: [],
  overriddenSaveFlags: [],
}

const withSources = (change: Partial<DevFlagPanelSources>): DevFlagPanelSources => ({
  ...DEFAULT_SOURCES,
  ...change,
})

function rowOf(sources: DevFlagPanelSources, id: DevFlagId, shipped?: ShippedDevFlags) {
  const rows = devFlagPanelModelOf(sources, DEV_FLAG_ROWS, shipped).groups.flatMap((g) => g.rows)
  return rows.find((row) => row.id === id) as DevFlagPanelRow
}

describe('dev flag panel', () => {
  it('lists every flag of the metadata table once, client and authority apart', () => {
    const model = devFlagPanelModelOf(DEFAULT_SOURCES)
    expect(model.groups.map((group) => group.title)).toEqual(['Client', 'Authority'])
    const ids = model.groups.flatMap((group) => group.rows.map((row) => row.id))
    expect([...ids].sort()).toEqual(DEV_FLAG_ROWS.map((row) => row.id).sort())
    expect(model.groups[0].rows.map((row) => row.id)).toEqual([
      'drill.sweptCut',
      'drill.reportEveryTick',
    ])
  })

  it('shows a flag added to the table later by itself', () => {
    const added: DevFlagRow = { ...DEV_FLAG_ROWS[2], name: 'Later flag' }
    const model = devFlagPanelModelOf(DEFAULT_SOURCES, [...DEV_FLAG_ROWS, added])
    expect(model.groups[1].rows.map((row) => row.name)).toContain('Later flag')
  })

  it('shows each row with its switch, default, line, apply rule and pairing note', () => {
    const row = rowOf(DEFAULT_SOURCES, 'heat.workUncapped')
    expect(row).toMatchObject({
      name: 'Uncapped work heat',
      isOn: true,
      defaultText: 'Default on',
      pairingRule: 'No pairing rule recorded.',
      isPending: false,
      isReadOnly: false,
      pairWarnings: [],
      staleDefault: null,
    })
    expect(row.line.length).toBeGreaterThan(0)
    expect(row.applyRule).toContain('debug.setFlags')
  })

  it('marks the swept cut experimental and shows its flip pending until the drill is idle', () => {
    const client = withChosenClientFlags(SHIPPED_CLIENT_DEV_FLAGS, { 'drill.sweptCut': false })
    const row = rowOf(withSources({ client }), 'drill.sweptCut')
    expect(row).toMatchObject({ isExperimental: true, isPending: true, isOn: false })
  })

  it("shows a guest the room's authority flags read-only, and its own client flags open", () => {
    const authority = { ...AUTHORITY_DEV_FLAGS, 'enemy.lureRetarget': false }
    const guest = withSources({ authority, isHost: false })
    expect(rowOf(guest, 'enemy.lureRetarget')).toMatchObject({ isOn: false, isReadOnly: true })
    expect(rowOf(guest, 'drill.reportEveryTick').isReadOnly).toBe(false)
  })

  it('warns on every-tick reports while the exact carry is off', () => {
    const authority = { ...AUTHORITY_DEV_FLAGS, 'drill.exactCarry': false }
    const sources = withSources({ authority })
    expect(rowOf(sources, 'drill.reportEveryTick').pairWarnings).toEqual([
      'Needs drill.exactCarry on: does nothing while it is off.',
    ])
    expect(rowOf(sources, 'drill.reportCapsule').pairWarnings).toHaveLength(1)
  })

  it('warns that the swept law charge does nothing once the swept cut is chosen off', () => {
    const client = withChosenClientFlags(SHIPPED_CLIENT_DEV_FLAGS, { 'drill.sweptCut': false })
    expect(rowOf(withSources({ client }), 'drill.sweptLawCharge').pairWarnings).toEqual([
      'Needs drill.sweptCut on: does nothing while it is off.',
    ])
  })

  it('warns about nothing on the shipped flags', () => {
    const rows = devFlagPanelModelOf(DEFAULT_SOURCES).groups.flatMap((group) => group.rows)
    expect(rows.flatMap((row) => row.pairWarnings)).toEqual([])
  })

  it('offers to drop an override that pins its flag against a changed default', () => {
    const flipped = { ...SHIPPED_DEV_FLAGS, 'drill.exactCarry': false }
    const overrides = { 'drill.exactCarry': { isOn: true, defaultWhenSet: true } }
    const row = rowOf(withSources({ overrides }), 'drill.exactCarry', flipped)
    expect(row.staleDefault).toEqual({
      text: 'Default changed from on to off',
      isDroppable: true,
    })
    expect(row.isRemembered).toBe(true)
  })

  it('says when an override was dropped because the default flipped to its value', () => {
    const flipped = { ...SHIPPED_DEV_FLAGS, 'heat.workUncapped': false }
    const sources = withSources({ changedDefaults: ['heat.workUncapped'] })
    expect(rowOf(sources, 'heat.workUncapped', flipped).staleDefault).toEqual({
      text: 'Default changed from on to off; your override was dropped',
      isDroppable: false,
    })
  })

  it('marks a row whose remembered value runs over the loaded save', () => {
    const sources = withSources({ overriddenSaveFlags: ['drill.exactCarry'] })
    expect(rowOf(sources, 'drill.exactCarry').isOverSave).toBe(true)
  })

  it('keeps the run marked after every flag is back at its default', () => {
    expect(devFlagPanelModelOf(withSources({ isEverSet: true })).isRunMarked).toBe(true)
  })
})

describe('dev flag badge', () => {
  it('stays hidden on the shipped flags, and outside a debug session whatever runs', () => {
    expect(devFlagBadgeOf(DEFAULT_SOURCES, true)).toBeNull()
    const authority = { ...AUTHORITY_DEV_FLAGS, 'drill.exactCarry': false }
    expect(devFlagBadgeOf(withSources({ authority }), false)).toBeNull()
  })

  it('counts each flag off its default once, running or remembered', () => {
    const authority = { ...AUTHORITY_DEV_FLAGS, 'drill.exactCarry': false }
    const client = withChosenClientFlags(SHIPPED_CLIENT_DEV_FLAGS, { 'drill.sweptCut': false })
    const overrides = {
      'drill.exactCarry': { isOn: false, defaultWhenSet: true },
      'heat.workUncapped': { isOn: false, defaultWhenSet: true },
    }
    const badge = devFlagBadgeOf(withSources({ authority, client, overrides }), true)
    expect(badge).toEqual({ count: 3, title: '3 debug flags', note: '' })
  })

  it('says when the remembered override runs over the loaded save', () => {
    const authority = { ...AUTHORITY_DEV_FLAGS, 'drill.exactCarry': false }
    const sources = withSources({ authority, overriddenSaveFlags: ['drill.exactCarry'] })
    expect(devFlagBadgeOf(sources, true)).toEqual({
      count: 1,
      title: '1 debug flag',
      note: OVER_SAVE_NOTE,
    })
  })

  it('goes once every flag is back at its default, even in a marked run', () => {
    expect(devFlagBadgeOf(withSources({ isEverSet: true }), true)).toBeNull()
  })
})
