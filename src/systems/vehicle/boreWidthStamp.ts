/**
 * The drill's stamp at the rig's width level (GD lock on #662 Part B, ticket 749): the same disc,
 * centred where the bare body's stamp is, its radius grown to the level's bore along the pose's aim
 * (`boreRadiusMmAlongAt`), so the cut is the wider body plus the clearance either side. The swept
 * cut's front still stands where the work reached (`world/cutFront.ts`), so a wider stamp opens
 * ground across the aim, never further ahead, and time to core is the bare bore's.
 *
 * The cells it opens outside the bare 1.2 m bore are the width's cells: the cell's centre lies
 * further than the bare stamp's radius from the same path, so the bare bore would have left more
 * than half the cell standing across it. They pay the kernel's side ore share (`sideOreCredit.ts`)
 * and, being the disc's own, their full dig energy and heat.
 */
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import { isWithinStampAt, type DiscStamp } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import type { Aim } from './aim'
import { BARE_WIDTH_LEVEL, boreRadiusMmAlongAt, drillStampRadiusMmAlong } from './drillBore'

/** The stamp grown to the bore of `widthLevel` along `aim`; the bare level leaves it as built. */
export function stampAtWidthLevel(stamp: DiscStamp, aim: Aim, widthLevel: number): DiscStamp {
  if (widthLevel === BARE_WIDTH_LEVEL) return stamp
  return { ...stamp, radiusMm: boreRadiusMmAlongAt(aim, widthLevel) }
}

/** The tiles of `tiles` outside the bare bore along `aim` on `disc`'s path, in order. */
export function cellsBeyondBareBore(
  disc: DiscStamp,
  aim: Aim,
  tiles: readonly TilePoint[],
): TilePoint[] {
  const bareRadiusMm = drillStampRadiusMmAlong(aim)
  if (disc.radiusMm <= bareRadiusMm) return []
  const bare: DiscStamp = { ...disc, radiusMm: bareRadiusMm, edge: 'soft' }
  return tiles.filter((tile) => !isCentreWithin(bare, tile))
}

/** Whether the tile's centre lies within the stamp's radius of its path, its floor band included. */
function isCentreWithin(disc: DiscStamp, { tx, ty }: TilePoint): boolean {
  const centre = SAMPLES_PER_TILE / 2
  return isWithinStampAt(disc, tx * SAMPLES_PER_TILE + centre, ty * SAMPLES_PER_TILE + centre)
}
