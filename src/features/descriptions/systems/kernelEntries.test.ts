import { describe, expect, it } from 'vitest'
import { ORE_WHISPER_RANGE_TILES, ORE_WHISPER_ROCK_TILES } from '../../../constants/scene'
import { ARTEFACT_ID, ARTEFACT_OPTIONS } from '../../../systems/artefacts/artefactOptions'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { formatPercent } from '../../../systems/displayAmount'
import { casingHardness } from '../../../systems/economy/casingGrades'
import { UPGRADE_IDS, type UpgradeId } from '../../../systems/economy/economyDefinition'
import { gunMountStep, gunShotsPerSecond, gunTopStep } from '../../../systems/economy/gunStats'
import { trackKindOf } from '../../../systems/economy/trackKind'
import { refinerySlotsStart } from '../../../systems/economy/refineryEconomy'
import { majorOf, stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { startLevels, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
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

/** Majors pinned (VS on #164), each read at its major, mid-major and the buy landing the next. */
const PINNED_MAJORS = [0, 1, 20, 247, 607, 6007]
const HIGH_MAJORS = [607, 6007]
const PINNED_PIPS = [0, 4, 9]
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

/** The track's stat lines, without the closing level line. */
function statLinesOf(upgradeId: UpgradeId, step: number): readonly StatLine[] {
  return linesOf(trackItemOf(upgradeId), step).slice(0, statsOfTrack(upgradeId).length)
}

function stepsOf(majors: readonly number[]): number[] {
  return majors.flatMap((major) => PINNED_PIPS.map((pip) => stepOfMajor(major) + pip))
}

/** The track's stats as the Upgrade bay's own preview reads them (`statsAfter` names). */
function kernelStatsOf(upgradeId: UpgradeId, step: number): Money[] {
  const canonical = canonicalStatsOf(vehicleStatsAt({ ...startLevels(), [upgradeId]: step }))
  return statsOfTrack(upgradeId).map((stat) => fromCanonical(canonical[stat]))
}

function shownStat(amount: Money): string {
  return statReading(toCanonical(amount)).text
}

function expectedLine(upgradeId: UpgradeId, step: number, index: number) {
  const now = kernelStatsOf(upgradeId, step)[index]
  const next = kernelStatsOf(upgradeId, step + 1)[index]
  const majorStep = stepOfMajor(majorOf(step) + 1)
  return {
    now: shownStat(now),
    next: shownStat(next),
    deltaPct: formatPercent(div(sub(next, now), now)),
    major: {
      levelsTo: majorStep - step,
      value: shownStat(kernelStatsOf(upgradeId, majorStep)[index]),
    },
  }
}

function isKernelStatMoving(upgradeId: UpgradeId, step: number, index: number): boolean {
  const [now, next] = [step, step + 1].map((at) => kernelStatsOf(upgradeId, at)[index])
  return toCanonical(now) !== toCanonical(next)
}

/** Tracks whose every step moves the stat: the integer tracks gain a whole unit only on some pips. */
const GROWING_TRACKS = UPGRADE_IDS.filter((id) => trackKindOf(id) !== 'linearInt')

describe('descriptions side table: the six tracks', () => {
  it.each(UPGRADE_IDS)('pins every %s line to the kernel stat at the pinned steps', (id) => {
    for (const step of stepsOf(PINNED_MAJORS)) {
      const lines = statLinesOf(id, step)
      expect(lines).toHaveLength(statsOfTrack(id).length)
      lines.forEach((line, index) => expect(line).toMatchObject(expectedLine(id, step, index)))
    }
  })

  it.each(GROWING_TRACKS)(
    'shows a change and its share on every %s line at majors 607 and 6007',
    (id) => {
      for (const step of stepsOf(HIGH_MAJORS)) {
        for (const line of statLinesOf(id, step)) {
          expect([line.delta, line.deltaPct]).not.toContain(undefined)
          expect([line.delta, line.deltaPct]).not.toContain('0')
          expect(line.deltaPct).not.toBe('0%')
        }
      }
    },
  )

  it.each(UPGRADE_IDS)('never shows a change of 0 where the %s stat moves', (id) => {
    for (const step of stepsOf(PINNED_MAJORS)) {
      statLinesOf(id, step).forEach((line, index) => {
        if (!isKernelStatMoving(id, step, index)) return
        expect(line.delta).not.toBe('0')
        expect(line.deltaPct).not.toBe('0%')
      })
    }
  })

  it('shows the cargo line at major 607 rising by two on the buy that lands the next major', () => {
    const [cargo] = statLinesOf('cargo_hold', stepOfMajor(607) + 9)
    expect(cargo).toMatchObject({ now: '2,440', next: '2,442', delta: '2' })
    expect(cargo.deltaPct).toBe(formatPercent(div(fromCanonical('2'), fromCanonical('2440'))))
    expect(cargo.major).toEqual({ levelsTo: 1, value: '2,442' })
  })

  it('counts the steps to the next major on a track mid-level', () => {
    const [power] = statLinesOf('drill_power', stepOfMajor(20) + 4)
    expect(power.major?.levelsTo).toBe(6)
  })

  it('shows an engine line near its cap with the headroom left', () => {
    const step = stepOfMajor(247)
    const [speed] = statLinesOf('engine', step)
    const now = kernelStatsOf('engine', step)[0]
    const cap = fromCanonical('14')
    expect(speed.cap).toEqual({ value: '14', headroomPct: formatPercent(div(sub(cap, now), cap)) })
  })

  it('reads a sub-milli engine change as a tiny change, never as zero', () => {
    const [speed] = statLinesOf('engine', stepOfMajor(6007))
    expect(speed.now).toBe(speed.next)
    expect(speed.delta).toBe(TINY_CHANGE_TEXT)
  })

  it('closes every track card with the step as the Upgrade bay prints it', () => {
    const lines = linesOf(trackItemOf('hull'), stepOfMajor(13) + 4)
    expect(lines.at(-1)).toEqual({
      label: 'Level',
      kind: 'linearInt',
      now: '13 · 4/9',
      next: '13 · 5/9',
    })
  })

  it('names each line’s kind from the track’s curve family', () => {
    expect(linesOf(trackItemOf('drill_power'), 1)[0].kind).toBe('geometric')
    expect(linesOf(trackItemOf('boiler'), 1)[0].kind).toBe('linearInt')
    expect(statLinesOf('engine', 1).map((line) => line.kind)).toEqual([
      'saturating',
      'saturating',
      'saturating',
    ])
  })
})

describe('descriptions side table: gear, services, bays and artefacts', () => {
  it('shows the guns one step below the top with the top rate as the next, major and cap', () => {
    const [rate] = linesOf(KERNEL_ITEMS.guns, gunTopStep() - 1)
    const top = statReading(String(gunShotsPerSecond(gunTopStep()))).text
    expect(rate.next).toBe(top)
    expect(rate.major).toEqual({ levelsTo: 1, value: top })
    expect(rate.cap?.value).toBe(top)
  })

  it('shows no next rate and no next major at the guns’ top step', () => {
    const [rate] = linesOf(KERNEL_ITEMS.guns, gunTopStep())
    expect(rate.next).toBeUndefined()
    expect(rate.major).toBeUndefined()
    expect(rate.cap?.headroomPct).toBe(formatPercent(fromCanonical('0')))
  })

  it('offers the mount as the guns’ next step and next major before they are mounted', () => {
    const lines = linesOf(KERNEL_ITEMS.guns, 0)
    const mounted = statReading(String(gunShotsPerSecond(gunMountStep()))).text
    expect(lines[0]).toMatchObject({ now: '0', next: mounted })
    expect(lines[0].major).toEqual({ levelsTo: gunMountStep(), value: mounted })
    expect(lines.at(-1)).toMatchObject({ label: 'Level', now: '0', next: '1' })
  })

  it('says how many charges the vehicle carries on the restock card', () => {
    expect(linesOf(KERNEL_ITEMS.charges, 3).at(-1)).toMatchObject({
      label: 'Charges carried',
      now: '3',
    })
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
      now: shownStat(vehicleStatsAt(view.levels).hullMax),
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
