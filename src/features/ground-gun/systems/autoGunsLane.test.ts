import { describe, expect, it } from 'vitest'
import { contentOf } from '../../../systems/registries/content'
import { flavourProblemsOf } from '../../descriptions'
import { armouryModuleOf } from './armouryModules'
import { AUTO_GUNS_LANE, AUTO_GUNS_MODULES } from './autoGunsLane'
import { extendedBarrelsAt, extendedBarrelsRangeMarks } from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'

const EXTENDED_BARRELS = 'weapon.extended_barrels'

/** Content's table on #310 as the GD locked it: node, planet, prerequisites. */
const CONTENT_TABLE = [
  ['tech.auto_guns.fire_director', 11, []],
  ['tech.auto_guns.sentry_cam', 14, ['tech.auto_guns.fire_director']],
  ['tech.auto_guns.extended_barrels', 19, ['tech.auto_guns.fire_director']],
  ['tech.auto_guns.concussion_shells', 22, ['tech.auto_guns.fire_director']],
  ['tech.auto_guns.grapeshot_breech', 26, ['tech.auto_guns.extended_barrels']],
  ['tech.auto_guns.flushing_shell', 30, ['tech.auto_guns.concussion_shells']],
  ['tech.auto_guns.overpressure_burst', 35, ['tech.auto_guns.extended_barrels']],
  ['tech.auto_guns.ricochet_shot', 36, ['tech.auto_guns.extended_barrels']],
]

/** #364's `turret.*` groups (`docs/art/armoury/armouryMounts.json`). */
const ART_MOUNTS = {
  'weapon.fire_director': 'sight',
  'weapon.sentry_cam': 'cam',
  'weapon.extended_barrels': 'barrel',
  'weapon.concussion_shells': 'magazine',
  'weapon.grapeshot_breech': 'breech',
  'weapon.flushing_shell': 'cradle',
  'weapon.overpressure_burst': 'boiler',
  'weapon.ricochet_shot': 'hopper',
}

describe('ground-gun: the armoury.auto_guns lane (ticket 319, Content on #310)', () => {
  it("authors Content's eight nodes on their planets, the ricochet behind a hollow", () => {
    expect(AUTO_GUNS_MODULES.map(({ node }) => [node.id, node.unlockTier, node.prereqs])).toEqual(
      CONTENT_TABLE,
    )
    expect(AUTO_GUNS_MODULES.flatMap(({ node }) => node.requiresDiscovery ?? [])).toEqual([
      'hazard:hollow',
    ])
  })

  it('mounts every module on the turret group its art was made for', () => {
    expect(
      Object.fromEntries(AUTO_GUNS_MODULES.map(({ itemId, mount }) => [itemId, mount])),
    ).toEqual(ART_MOUNTS)
  })

  it("finds every module's numbers in groundGun.json, the barrels on their range ladder", () => {
    const rotating = AUTO_GUNS_MODULES.filter(({ itemId }) => itemId !== EXTENDED_BARRELS)
    expect(() => rotating.map(({ itemId }) => armouryModuleOf(itemId))).not.toThrow()
    expect(extendedBarrelsAt(extendedBarrelsRangeMarks()).rangeTiles).toBe(
      GROUND_GUN.turret.gunRangeCap,
    )
  })

  it('keeps every flavour line inside the #159 rules', () => {
    expect(AUTO_GUNS_MODULES.flatMap(({ description }) => flavourProblemsOf(description))).toEqual(
      [],
    )
  })

  it('registers no node while every module waits on a turret seam', () => {
    expect(AUTO_GUNS_MODULES.every((module) => module.isHeldBack)).toBe(true)
    expect(contentOf('tech-node').filter((node) => node.lane === AUTO_GUNS_LANE)).toEqual([])
  })
})
