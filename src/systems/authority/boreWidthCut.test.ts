import { describe, expect, it } from 'vitest'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { withRegistrations } from '../../registries/registrar'
import { widthLevelOf } from '../registries/boreWidth'
import { boreRadiusMmAt } from '../vehicle/drillBore'
import type { DomainEventBody } from './domainEvent'
import { createScriptedSession } from './scriptedSession'
import {
  COLUMN_LEG,
  cutLeg,
  eventsOfLeg,
  reachAlongOf,
  rigAt,
  type LegRun,
} from './sweptRigFixtures'

// The bore's width kernel (ticket 749, GD lock on #662 Part B): the host derives the width level
// from what the player owns, the live drillStep's stamp grows to R = body/2 + clearance, the cut's
// front stays where the bare bore's work reaches, and the cells past the bare 1.2 m bore are the
// width's. Width sources come as fakes through withRegistrations, so no slice is imported.

const LEG_TICKS = 90

function widthProbe(...levels: number[]): SliceDefinition {
  return {
    id: 'width-probe',
    register: (r) =>
      levels.forEach((level, index) =>
        r.boreWidth({ id: `width-probe.source-${index}`, widthLevelsOf: () => level }),
      ),
  }
}

function legAtWidth(level: number): LegRun {
  const slices = level === 0 ? [] : [widthProbe(level)]
  return withRegistrations(slices, () =>
    cutLeg({ rig: rigAt(44), leg: COLUMN_LEG, maxTicks: LEG_TICKS }),
  )
}

function destroyedOf(run: LegRun): Extract<DomainEventBody, { type: 'TileDestroyed' }>[] {
  return eventsOfLeg(run).flatMap((event) => (event.type === 'TileDestroyed' ? [event] : []))
}

function cellKeysOf(run: LegRun): Set<string> {
  return new Set(destroyedOf(run).map(({ tx, ty }) => `${tx},${ty}`))
}

function lastStateOf(run: LegRun) {
  return run.ticks[run.ticks.length - 1].state
}

describe('bore width kernel', () => {
  it('adds every width source’s whole levels into one level, never below the bare body', () => {
    const state = createScriptedSession().state()
    expect(withRegistrations([], () => widthLevelOf(state, 'p1'))).toBe(0)
    expect(withRegistrations([widthProbe(1, 2)], () => widthLevelOf(state, 'p1'))).toBe(3)
    expect(withRegistrations([widthProbe(-4, 1.7)], () => widthLevelOf(state, 'p1'))).toBe(1)
  })

  it('opens a wider bore at width level 1 than the bare rig on the same leg', () => {
    const bare = cellKeysOf(legAtWidth(0))
    const wide = cellKeysOf(legAtWidth(1))
    expect([...bare].every((cell) => wide.has(cell))).toBe(true)
    expect(wide.size).toBeGreaterThan(bare.size)
  })

  it('cuts down the leg as far at width level 1 as the bare rig: the work, not the width, sets the pace', () => {
    const bare = legAtWidth(0)
    const wide = legAtWidth(1)
    const bareReachMm = reachAlongOf(COLUMN_LEG, lastStateOf(bare))
    const wideReachMm = reachAlongOf(COLUMN_LEG, lastStateOf(wide))
    // Within the #662 Part B bar of +-1%: a wider stamp clears the line's cells whole, which moves
    // where a bite's price stops falling by a few cm over the leg.
    expect(Math.abs(wideReachMm - bareReachMm)).toBeLessThanOrEqual(bareReachMm / 100)
  })

  it('marks only the cells past the bare bore as width cells', () => {
    const bare = cellKeysOf(legAtWidth(0))
    const widthCells = destroyedOf(legAtWidth(1)).filter((event) => event.isWidthCell === true)
    expect(widthCells.length).toBeGreaterThan(0)
    expect(widthCells.every(({ tx, ty }) => !bare.has(`${tx},${ty}`))).toBe(true)
  })

  it('marks no width cell on a bare rig, so its events read as before', () => {
    expect(destroyedOf(legAtWidth(0)).some((event) => event.isWidthCell !== undefined)).toBe(false)
  })

  it('opens cells across the leg as far as the wider stamp reaches and no further', () => {
    const columnMm = COLUMN_LEG.start.xMm
    const span = (level: number) => {
      const xs = destroyedOf(legAtWidth(level)).map(({ tx }) => tx)
      return { west: Math.min(...xs), east: Math.max(...xs) }
    }
    const reachMm = boreRadiusMmAt(2) + 125
    const wide = span(2)
    const bare = span(0)
    expect(wide.west).toBeGreaterThanOrEqual(Math.floor((columnMm - reachMm) / 1000))
    expect(wide.east).toBeLessThanOrEqual(Math.floor((columnMm + reachMm) / 1000))
    expect(wide.east - wide.west).toBeGreaterThan(bare.east - bare.west)
  })

  it('lines the wider rig’s wall with rings round its own bore', () => {
    const linedRingsOf = (run: LegRun) =>
      eventsOfLeg(run).filter((event) => event.type === 'CasingPlaced' && event.samples > 0).length
    expect(linedRingsOf(legAtWidth(1))).toBeGreaterThan(0)
  })
})
