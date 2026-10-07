import { describe, expect, it } from 'vitest'
import { ORE_WHISPER_RANGE_TILES, ORE_WHISPER_ROCK_TILES } from '../../../constants/scene'
import { ARTEFACT_ID, ARTEFACT_OPTIONS } from '../../../systems/artefacts/artefactOptions'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { formatPercent } from '../../../systems/displayAmount'
import { casingHardness } from '../../../systems/economy/casingGrades'
import { UPGRADE_IDS, type UpgradeId } from '../../../systems/economy/economyDefinition'
import { gunMaxLevel, gunShotsPerSecond } from '../../../systems/economy/gunStats'
import { refinerySlotsStart } from '../../../systems/economy/refineryEconomy'
import { hullMax, startLevels, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { div, fromCanonical, sub, toCanonical, type Money } from '../../../systems/money'
import type { ItemCtx, ItemRef, StatLine } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import {
  artefactItemOf,
  bayItemOf,
  KERNEL_ITEMS,
  trackItemOf,
} from '../../../systems/registries/kernelItems'
import { canonicalStatsOf } from '../../../systems/vehicle/vehicleStatsView'
import { statReading } from '../../../systems/views/viewParts'
import { statsOfTrack } from '../../../systems/views/workshopRows'
import { describeItemCard } from './describeItemCard'
import { TINY_CHANGE_TEXT } from './statLineOf'

const PINNED_LEVELS = [0, 1, 20, 247, 607, 6007]
const HIGH_LEVELS = [607, 6007]
const PLANET = 4

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: PLANET, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

function ctxAt(level: number): ItemCtx {
  return { playerId: 'p1', planetIndex: PLANET, level, source: { kind: 'shop' }, view }
}

function linesOf(ref: ItemRef, level: number): readonly StatLine[] {
  return describeItemCard(ref, ctxAt(level))?.statLines ?? []
}

/** The track's stats as the Upgrade bay's own preview reads them (`statsAfter` names). */
function kernelStatsOf(upgradeId: UpgradeId, level: number): Money[] {
  const canonical = canonicalStatsOf(vehicleStatsAt({ ...startLevels(), [upgradeId]: level }))
  return statsOfTrack(upgradeId).map((stat) => fromCanonical(canonical[stat]))
}

function shownStat(amount: Money): string {
  return statReading(toCanonical(amount)).text
}

function expectedLine(upgradeId: UpgradeId, level: number, index: number) {
  const now = kernelStatsOf(upgradeId, level)[index]
  const next = kernelStatsOf(upgradeId, level + 1)[index]
  return {
    now: shownStat(now),
    next: shownStat(next),
    deltaPct: formatPercent(div(sub(next, now), now)),
  }
}

describe('descriptions side table: the six tracks', () => {
  it.each(UPGRADE_IDS)('pins every %s line to the kernel stat at the pinned levels', (id) => {
    for (const level of PINNED_LEVELS) {
      const lines = linesOf(trackItemOf(id), level)
      expect(lines).toHaveLength(statsOfTrack(id).length)
      lines.forEach((line, index) => expect(line).toMatchObject(expectedLine(id, level, index)))
    }
  })

  it.each(UPGRADE_IDS)('shows a change and its share on every %s line at L 607 and 6007', (id) => {
    for (const level of HIGH_LEVELS) {
      for (const line of linesOf(trackItemOf(id), level)) {
        expect([line.delta, line.deltaPct]).not.toContain(undefined)
        expect([line.delta, line.deltaPct]).not.toContain('0')
        expect(line.deltaPct).not.toBe('0%')
      }
    }
  })

  it('shows the cargo line at L 607 rising by four, with its share', () => {
    const [cargo] = linesOf(trackItemOf('cargo_hold'), 607)
    expect(cargo).toMatchObject({ now: '2,438', next: '2,442', delta: '4' })
    expect(cargo.deltaPct).toBe(formatPercent(div(fromCanonical('4'), fromCanonical('2438'))))
  })

  it('shows an engine line near its cap with the headroom left', () => {
    const [speed] = linesOf(trackItemOf('engine'), 247)
    const now = kernelStatsOf('engine', 247)[0]
    const cap = fromCanonical('14')
    expect(speed.cap).toEqual({ value: '14', headroomPct: formatPercent(div(sub(cap, now), cap)) })
  })

  it('reads a sub-milli engine change as a tiny change, never as zero', () => {
    const [speed] = linesOf(trackItemOf('engine'), 6007)
    expect(speed.now).toBe(speed.next)
    expect(speed.delta).toBe(TINY_CHANGE_TEXT)
  })

  it('names each line’s kind from the track’s curve family', () => {
    expect(linesOf(trackItemOf('drill_power'), 1)[0].kind).toBe('geometric')
    expect(linesOf(trackItemOf('boiler'), 1)[0].kind).toBe('linearInt')
    expect(linesOf(trackItemOf('engine'), 1).map((line) => line.kind)).toEqual([
      'saturating',
      'saturating',
      'saturating',
    ])
  })
})

describe('descriptions side table: gear, services, bays and artefacts', () => {
  it('shows the guns one level below the top with the top rate as the cap', () => {
    const [rate] = linesOf(KERNEL_ITEMS.guns, gunMaxLevel() - 1)
    const top = statReading(String(gunShotsPerSecond(gunMaxLevel()))).text
    expect(rate.next).toBe(top)
    expect(rate.cap?.value).toBe(top)
  })

  it('shows no next rate at the guns’ top level', () => {
    const [rate] = linesOf(KERNEL_ITEMS.guns, gunMaxLevel())
    expect(rate.next).toBeUndefined()
    expect(rate.cap?.headroomPct).toBe(formatPercent(fromCanonical('0')))
  })

  it('pins the casing’s lining hardness to the kernel at this planet', () => {
    const [, hardness] = linesOf(KERNEL_ITEMS.casing, 3)
    expect(hardness.now).toBe(shownStat(casingHardness(PLANET, 3)))
    expect(hardness.next).toBe(shownStat(casingHardness(PLANET, 4)))
  })

  it('pins the repair to the hull the vehicle’s level holds, with no next', () => {
    const [hull] = linesOf(KERNEL_ITEMS.repair, 0)
    expect(hull).toEqual({
      label: 'Hull restored to',
      kind: 'geometric',
      now: shownStat(hullMax(view.levels.hull)),
    })
  })

  it('pins the travel line to the next planet', () => {
    expect(linesOf(KERNEL_ITEMS.travel, 0)[0].now).toBe(String(PLANET + 1))
  })

  it('pins the refinery bay to the slots a new refinery has', () => {
    expect(linesOf(bayItemOf('refinery'), 0)[0].now).toBe(String(refinerySlotsStart()))
  })

  it('shows the artefact summary’s digits as stat lines, from the rules’ own numbers', () => {
    const lines = linesOf(artefactItemOf(ARTEFACT_ID.oreWhisper), 0)
    expect(lines.map((line) => line.now)).toEqual([
      String(ORE_WHISPER_RANGE_TILES),
      String(ORE_WHISPER_ROCK_TILES),
    ])
  })

  it('gives every artefact prose flavour of its own and leaves the kernel summaries as they were', () => {
    for (const option of ARTEFACT_OPTIONS) {
      const flavour = describeItemCard(artefactItemOf(option.id), ctxAt(0))?.flavour
      expect(flavour).not.toBe(option.summary)
      expect(flavour).not.toMatch(/\d/)
    }
    expect(ARTEFACT_OPTIONS.map((option) => option.summary)).toEqual(KERNEL_SUMMARIES_ON_MAIN)
  })
})

/** The kernel's artefact summaries as main has them: this slice writes no kernel field (Q1). */
const KERNEL_SUMMARIES_ON_MAIN = [
  'While undocked, ore within 16 m glows at its rim through up to 1 m of rock.',
  'Once per dock cycle, the first collapse warning on your tunnels is braced and filled.',
  'At the Sell bay, ore from the shallow bands sells at the mid-band price.',
]
