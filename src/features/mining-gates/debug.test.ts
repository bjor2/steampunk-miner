import { beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../../store/authorityLink'
import { resetGameStore } from '../../store/gameStore'
import { miningGatesDebugActions as actions } from './debug'
import { resetGateHintStore } from './store/gateHintStore'

beforeEach(() => {
  resetGameStore()
})

describe('mining gates: debug actions', () => {
  it('owns no extractor by default, and owns one only once it is granted', () => {
    expect(actions.ownsRig('rig.resonance')).toEqual({ ok: true, owned: false })
    expect(actions.grantRig('rig.resonance')).toEqual({ ok: true })
    expect(actions.ownsRig('rig.resonance')).toEqual({ ok: true, owned: true })
    expect(actions.ownsRig('rig.containment')).toEqual({ ok: true, owned: false })
    expect(readAuthorityState().debugApplied).toBe(true)
  })

  it('keeps every extractor already owned when it grants the next', () => {
    actions.grantRig('rig.resonance')
    actions.grantRig('rig.containment')
    expect(actions.ownsRig('rig.resonance')).toEqual({ ok: true, owned: true })
  })

  it('refuses an id that is no extractor and changes nothing', () => {
    expect(actions.grantRig('rig.nothing').ok).toBe(false)
    expect(readAuthorityState().debugApplied).toBe(false)
  })

  it("reads a planet's gates per band, extractors by id", () => {
    const table = actions.gateTableOf(7, 83921) as {
      ok: true
      bands: { family: string; lead: number; gate: { kind: string } }[][]
    }
    expect(table.ok).toBe(true)
    expect(table.bands[4]).toContainEqual(
      expect.objectContaining({
        family: 'fossil',
        lead: 1,
        gate: { kind: 'dynamite', minCharge: 1 },
      }),
    )
    expect(actions.gateTableOf(0, 83921).ok).toBe(false)
  })

  it("counts each seed's dynamite-gated tiles and says whether the act has a dynamite family", () => {
    const cells = actions.dynamiteCellsOf(7, [83921]) as {
      ok: true
      isDynamiteAct: boolean
      tilesBySeed: number[]
    }
    expect(cells.isDynamiteAct).toBe(true)
    expect(cells.tilesBySeed).toHaveLength(1)
    expect(cells.tilesBySeed[0]).toBeGreaterThan(0)
    expect(actions.dynamiteCellsOf(7, 83921).ok).toBe(false)
  })

  it('lists the extractors with the planet each arrives on', () => {
    const described = actions.describe() as { ok: true; rigs: { availableFromPlanet: number }[] }
    expect(described.rigs.map((rig) => rig.availableFromPlanet)).toEqual([5, 12, 19, 26, 33])
  })

  it('reads the lock marker a tile wears, and refuses a tile that is not whole', () => {
    expect(actions.lockMarkerAt(0, 0)).toEqual({ ok: true, kind: 'none', motion: null, tint: null })
    expect(actions.lockMarkerAt(0.5, 0).ok).toBe(false)
  })

  it('shows no hint chip before the drill meets a gate', () => {
    resetGateHintStore()
    expect(actions.hintChip()).toEqual({ ok: true, chip: null })
  })
})
