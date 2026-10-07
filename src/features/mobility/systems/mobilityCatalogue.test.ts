import { describe, expect, it } from 'vitest'
import { contentOf } from '../../../systems/registries/content'
import { attachOf } from '../../../systems/registries/vehicleAttach'
import { acceptedSlotsOf } from '../../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../../ui/vectorIcons'
import { flavourProblemsOf } from '../../descriptions'
import { lastMarkOf } from '../../tech-tree'
import { MOBILITY_ITEM, THIRD_CRADLE } from './itemIds'
import { MOBILITY_ITEM_ROWS, MOBILITY_ROWS } from './mobilityCatalogue'
import { markLadderOf } from './markLadders'
import { statPreview } from './statPreview'

// #162 acceptance 1 and 2 for the mobility lane, on the loaded slices: every row resolves its
// icon, keeps the flavour rules, previews its stat lines at every Mark, carries a label, and a
// physical item takes the power-up slots and exactly one attach point.

const ITEM_IDS = Object.values(MOBILITY_ITEM)

const nodeOf = (itemId: string) => contentOf('tech-node').find((node) => node.unlocks === itemId)

describe('mobility catalogue', () => {
  it('registers the ten items as vehicle items and power-ups, and eleven tech nodes', () => {
    const vehicleItems = contentOf('vehicle-item').map((item) => item.id)
    const powerUps = contentOf('power-up').map((powerUp) => powerUp.itemId)
    expect(ITEM_IDS.filter((id) => !vehicleItems.includes(id))).toEqual([])
    expect(ITEM_IDS.filter((id) => !powerUps.includes(id))).toEqual([])
    const lane = contentOf('tech-node').filter((node) => node.lane === 'mobility')
    expect(lane.map((node) => node.id)).toHaveLength(11)
    expect(nodeOf(THIRD_CRADLE)).toMatchObject({ id: 'tech.mobility.cradle_3', label: 'both' })
  })

  it('gives every row and node an icon that resolves', () => {
    const unresolved = MOBILITY_ROWS.filter((row) => iconUrlOf(row.iconId) === null)
    expect(unresolved.map((row) => row.itemId)).toEqual([])
    const nodes = MOBILITY_ROWS.map((row) => nodeOf(row.itemId)!)
    expect(nodes.filter((node) => iconUrlOf(node.iconId) === null)).toEqual([])
  })

  it('keeps every flavour line to the copy rules: no digits, at most 80 characters, no "rig"', () => {
    const problems = MOBILITY_ROWS.flatMap((row) =>
      flavourProblemsOf(row.flavour).map((problem) => `${row.itemId}: ${problem}`),
    )
    expect(problems).toEqual([])
    expect(MOBILITY_ROWS.filter((row) => /\brig\b/i.test(`${row.name} ${row.flavour}`))).toEqual([])
  })

  it('previews stat lines and a price for every item at every Mark to its last', () => {
    const empty = MOBILITY_ITEM_ROWS.flatMap((row) => {
      const last = lastMarkOf(markLadderOf(row.itemId)!)
      return Array.from({ length: last }, (_, index) => index + 1)
        .filter((mark) => statPreview(row.itemId, mark, row.unlockTier).length < 2)
        .map((mark) => `${row.itemId} Mark ${mark}`)
    })
    expect(empty).toEqual([])
  })

  it('labels every base item horizontal', () => {
    const labels = MOBILITY_ITEM_ROWS.map((row) => nodeOf(row.itemId)!.label)
    expect(new Set(labels)).toEqual(new Set(['horizontal']))
  })

  it('takes every physical item in the power-up slots at exactly one attach point', () => {
    const rows = MOBILITY_ITEM_ROWS.map((row) => ({
      itemId: row.itemId,
      slots: acceptedSlotsOf(row.itemId),
      attach: attachOf(row.itemId),
    }))
    expect(rows.filter((row) => row.slots.length !== 5 || row.attach === null)).toEqual([])
    expect(attachOf(MOBILITY_ITEM.grappleWinch)).toBe('hull.arm.right')
    expect(attachOf(MOBILITY_ITEM.smokeCanister)).toBe('hull.rear')
    expect(attachOf(MOBILITY_ITEM.steamShield)).toBe('slot')
  })

  it('holds the heat sink flask node until refractory lining is owned (#162 acceptance 8)', () => {
    expect(nodeOf(MOBILITY_ITEM.heatSinkFlask)?.requiresOwned).toEqual(['refractory_lining'])
  })

  it('claims the four Schedule C rows at their planets', () => {
    const claims = MOBILITY_ROWS.filter((row) => row.scheduleRowId !== undefined).map((row) => [
      nodeOf(row.itemId)!.scheduleRowId,
      row.unlockTier,
    ])
    expect(claims).toEqual([
      ['shields', 22],
      ['grav_anchor', 32],
      ['buoyancy_tanks', 34],
      ['escape_thrusters', 37],
    ])
  })
})
