/**
 * The `armoury.auto_guns` lane (Content's node table on #310 as the GD locked it, ticket 319): the
 * `auto_guns` turret's eight modules as store items, each with its capability node, anchored on the
 * shipped `auto_guns` row (P4) so the lane stays hidden until that row's `FeatureUnlocked`. The
 * lane is re-based on P11 (Content's bend note: P5-P10 are full or held for #308).
 *
 * Every module changes how the kernel's turret picks, reaches, times or lands a shot
 * (`authority/combat/gunTargets.ts`, `gunFire.ts`), and no seam reaches either yet, so all eight
 * are held back: never registered, so no store, tree, card or bot sees them (the #205 GD lock's
 * held-back rule, as #318 held back the bore's signature modules). #388 registers them once the
 * kernel turret seams it is blocked by land (the #319 GD split). Mounts are the `turret.*` groups
 * of #364's art (`docs/art/armoury/armouryMounts.json`).
 */
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import type { ProgressionLabel } from '../../tech-tree'

export const AUTO_GUNS_LANE = 'armoury.auto_guns'

/** The shipped schedule row the lane anchors on (#107, P4). */
export const AUTO_GUNS_SCHEDULE_ROW = 'auto_guns'

/** Where the module sits on the turret (#364's review groups; the attach ids are the TD's). */
export type TurretMountZone =
  'sight' | 'cam' | 'barrel' | 'breech' | 'magazine' | 'cradle' | 'boiler' | 'hopper'

/** One module of the lane as Content's table writes it. */
export interface AutoGunsModule {
  itemId: string
  name: string
  iconId: string
  /** The flavour line: no digits, never "rig" (#159). */
  description: string
  label: ProgressionLabel
  mount: TurretMountZone
  /** Never registered until a kernel seam reaches its effect (#388). */
  isHeldBack: boolean
  node: AutoGunsNode
}

export interface AutoGunsNode {
  id: string
  iconId: string
  /** The placed planet; the item's one-off price is read there too (#162 4.1). */
  unlockTier: number
  prereqs: readonly string[]
  requiresDiscovery?: DiscoveryKey
}

export const AUTO_GUNS_MODULES: readonly AutoGunsModule[] = [
  {
    itemId: 'weapon.fire_director',
    name: 'Fire director',
    iconId: 'item-weapon-fire-director',
    description: 'A brass director ranks the pack and turns the turrets on the rearmost first.',
    label: 'horizontal',
    mount: 'sight',
    isHeldBack: true,
    node: nodeOf('fire_director', 11, []),
  },
  {
    itemId: 'weapon.sentry_cam',
    name: 'Sentry cam',
    iconId: 'item-weapon-sentry-cam',
    description: 'An iron cam swings the turrets over the drill face the moment the drill rests.',
    label: 'horizontal',
    mount: 'cam',
    isHeldBack: true,
    node: nodeOf('sentry_cam', 14, ['fire_director']),
  },
  {
    itemId: 'weapon.extended_barrels',
    name: 'Extended barrels',
    iconId: 'item-weapon-extended-barrels',
    description: 'Extended steel barrels carry every shell a tile further down the gallery.',
    label: 'both',
    mount: 'barrel',
    isHeldBack: true,
    node: nodeOf('extended_barrels', 19, ['fire_director']),
  },
  {
    itemId: 'weapon.concussion_shells',
    name: 'Concussion shells',
    iconId: 'item-weapon-concussion-shells',
    description: 'A blunt brass shell lands like a hammer and throws the biter off its lunge.',
    label: 'horizontal',
    mount: 'magazine',
    isHeldBack: true,
    node: nodeOf('concussion_shells', 22, ['fire_director']),
  },
  {
    itemId: 'weapon.grapeshot_breech',
    name: 'Grapeshot breech',
    iconId: 'item-weapon-grapeshot-breech',
    description: 'A hinged breech packs loose iron shot that scatters its one bite across a pack.',
    label: 'horizontal',
    mount: 'breech',
    isHeldBack: true,
    node: nodeOf('grapeshot_breech', 26, ['extended_barrels']),
  },
  {
    itemId: 'weapon.flushing_shell',
    name: 'Flushing shell',
    iconId: 'item-weapon-flushing-shell',
    description: 'A fat iron shell thumps the rock face and the shiver drives the burrower out.',
    label: 'horizontal',
    mount: 'cradle',
    isHeldBack: true,
    node: nodeOf('flushing_shell', 30, ['concussion_shells']),
  },
  {
    itemId: 'weapon.overpressure_burst',
    name: 'Overpressure burst',
    iconId: 'item-weapon-overpressure-burst',
    description: 'Held steam crowds the boiler and the guns rattle fast until the vent blows.',
    label: 'horizontal',
    mount: 'boiler',
    isHeldBack: true,
    node: nodeOf('overpressure_burst', 35, ['extended_barrels']),
  },
  {
    itemId: 'weapon.ricochet_shot',
    name: 'Ricochet shot',
    iconId: 'item-weapon-ricochet-shot',
    description: 'A hardened steel ball skips once off the pocket wall to find what hides behind.',
    label: 'horizontal',
    mount: 'hopper',
    isHeldBack: true,
    node: {
      ...nodeOf('ricochet_shot', 36, ['extended_barrels']),
      requiresDiscovery: 'hazard:hollow',
    },
  },
]

function nodeOf(name: string, unlockTier: number, prereqs: readonly string[]): AutoGunsNode {
  return {
    id: `tech.auto_guns.${name}`,
    iconId: `node-auto-guns-${name.replaceAll('_', '-')}`,
    unlockTier,
    prereqs: prereqs.map((prereq) => `tech.auto_guns.${prereq}`),
  }
}
