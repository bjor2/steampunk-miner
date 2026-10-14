/**
 * The Armoury modules on their guns (#310 build 5, ticket 321; art #364): every bought module of
 * the bore gun and the auto guns' turret hangs its `vehicle-item-weapon-*` asset at its mount's
 * point, so a module shows on the gun once bought (design 37.7), and its gilded plate shows only
 * once the module is Mastered (#310). Points live in `armouryMounts.json` in the gun's barrel
 * frame, origin the trunnion, so the quads here go straight into the group that turns the barrel.
 * A module with no mount row never draws (the #319 GD ruling's unattached-module rule). Render-only.
 */
import MOUNT_FILE from '../../armouryMounts.json'
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { slotItemAssetIdOf } from '../../../../systems/art/artIds'
import { assetQuadsOf, type AssetQuad } from '../../../../systems/art/assetLook'
import type { Pair } from '../../../../systems/art/partsSidecar'
import type { ArtAsset } from '../../../../systems/registries/artAssets'

export type ArmouryGun = 'bore' | 'turret'

/** The barrel group turns about the trunnion; the head stays on the cupola. */
export type MountRide = 'barrel' | 'head'

/** The part a Mastered module shows (#310: "Mastered modules show the gilded plate"). */
export const GILDED_PLATE_PART_ID = 'gilded-plate'

export interface ArmouryMount {
  gun: ArmouryGun
  rides: MountRide
  /** `muzzle` counts from the barrel's tip, which moves with the turret's barrel look. */
  from: 'trunnion' | 'muzzle'
  atM: Pair
}

export interface ArmouryModuleMount {
  itemId: string
  mount: string
  parts: readonly string[]
  /** A module that lengthens the gun moves another mount's modules out with it. */
  extends?: { mount: string; byM: Pair }
}

/** A module on the player's gun now, and whether it shows its plate. */
export interface BoughtModule {
  itemId: string
  isMastered: boolean
}

/** The bought modules' quads in the barrel frame, split by what carries them. */
export interface ModuleQuads {
  barrel: AssetQuad[]
  head: AssetQuad[]
}

/** Mounted gear is authored untiered (#166): its one look. */
const MODULE_LOOK = 1

interface ArmouryMountsFile {
  mounts: Readonly<Record<string, ArmouryMount>>
  modules: readonly ArmouryModuleMount[]
}

const FILE = MOUNT_FILE as unknown as ArmouryMountsFile
const MOUNTS = FILE.mounts
export const ARMOURY_MODULE_MOUNTS = FILE.modules

/** Every module's asset, with its parts, for `r.artAssets`. */
export function armouryArtAssets(): ArtAsset[] {
  return ARMOURY_MODULE_MOUNTS.map((module) => ({
    id: slotItemAssetIdOf(module.itemId),
    category: 'vehicle',
    parts: module.parts,
  }))
}

/** The module's mount on its gun; null for a module with no mount, which never draws. */
export function armouryMountOf(itemId: string): ArmouryMount | null {
  const module = moduleMountOf(itemId)
  return module === null ? null : (MOUNTS[module.mount] ?? null)
}

/** The item ids of the modules that hang on `gun`. */
export function moduleItemIdsOn(gun: ArmouryGun): string[] {
  return ARMOURY_MODULE_MOUNTS.filter((module) => MOUNTS[module.mount]?.gun === gun).map(
    (module) => module.itemId,
  )
}

/**
 * The bought modules on `gun`, each at its mount in the barrel frame. `muzzleX` is the barrel's tip
 * from the trunnion, where a `muzzle` mount counts from.
 */
export function moduleQuadsOf(
  art: ArtCatalogue,
  gun: ArmouryGun,
  bought: readonly BoughtModule[],
  muzzleX = 0,
): ModuleQuads {
  const quads = bought.flatMap((module) => placedOnGunOf(art, gun, module, bought, muzzleX))
  return {
    barrel: quads.filter((placed) => placed.rides === 'barrel').flatMap((placed) => placed.quads),
    head: quads.filter((placed) => placed.rides === 'head').flatMap((placed) => placed.quads),
  }
}

/** The far end of a barrel that rests along -X (the turret's): its leftmost edge. */
export function barrelTipOf(barrel: readonly AssetQuad[]): number {
  return Math.min(...barrel.map((quad) => quad.centre[0] - quad.size[0] / 2))
}

interface PlacedModule {
  rides: MountRide
  quads: AssetQuad[]
}

/** The module at its point, or nothing when it has no mount on `gun`. */
function placedOnGunOf(
  art: ArtCatalogue,
  gun: ArmouryGun,
  module: BoughtModule,
  bought: readonly BoughtModule[],
  muzzleX: number,
): PlacedModule[] {
  const mountId = moduleMountOf(module.itemId)?.mount
  const mount = mountId === undefined ? undefined : MOUNTS[mountId]
  if (mountId === undefined || mount?.gun !== gun) return []
  const point = mountPointOf(mountId, bought, muzzleX)
  const quads = shownQuadsOf(art, module).map((quad) => movedBy(quad, point))
  return [{ rides: mount.rides, quads }]
}

/** The mount's point, moved out by every bought module that lengthens the gun past it. */
function mountPointOf(mountId: string, bought: readonly BoughtModule[], muzzleX: number): Pair {
  const { from, atM } = MOUNTS[mountId]
  const base: Pair = from === 'muzzle' ? [muzzleX + atM[0], atM[1]] : atM
  return bought
    .map((module) => moduleMountOf(module.itemId)?.extends)
    .filter((extension) => extension?.mount === mountId)
    .reduce<Pair>((point, extension) => shifted(point, extension?.byM ?? [0, 0]), base)
}

/** The plate shows only once the module is Mastered. */
function shownQuadsOf(art: ArtCatalogue, module: BoughtModule): AssetQuad[] {
  const quads = assetQuadsOf(art, slotItemAssetIdOf(module.itemId), MODULE_LOOK)
  return module.isMastered ? quads : quads.filter((quad) => quad.partId !== GILDED_PLATE_PART_ID)
}

function moduleMountOf(itemId: string): ArmouryModuleMount | null {
  return ARMOURY_MODULE_MOUNTS.find((module) => module.itemId === itemId) ?? null
}

function movedBy(quad: AssetQuad, by: Pair): AssetQuad {
  return { ...quad, centre: shifted(quad.centre, by), pivot: shifted(quad.pivot, by) }
}

function shifted([x, y]: Pair, [dx, dy]: Pair): Pair {
  return [x + dx, y + dy]
}
