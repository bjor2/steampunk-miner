/**
 * The fold-flat drive (ticket 297, GD ruling on #237 Q2): each extractor part's group, laid out
 * folded by React, turned and shifted to the fraction its extractor's work gives, once per
 * authority tick and only when that fraction moved, never through React.
 */
import type { Group } from 'three'
import type { GearPart } from '../systems/render/techGear'
import {
  deployedPivotOf,
  deployingExtractorPartOf,
  FOLDED,
  type RigMount,
} from '../systems/render/rigGear'
import type { GearQuad } from '../systems/render/techGearQuads'

interface DeployingGroup {
  quad: GearQuad
  part: GearPart
  group: Group
  /** The fraction the group stands at now. */
  fraction: number
}

export interface ExtractorDeploy {
  groups: Map<string, DeployingGroup>
  /** The tick the groups were posed for; a new group clears it so it is posed next frame. */
  posedTick: number | null
}

export function createExtractorDeploy(): ExtractorDeploy {
  return { groups: new Map(), posedTick: null }
}

export function isAnyExtractorDeploying(mounts: readonly RigMount[]): boolean {
  return mounts.some((mount) => mount.quads.some((quad) => deployingExtractorPartOf(quad) !== null))
}

/**
 * The ref for the quad's group: an extractor part joins the drive at the folded pose its props
 * set; any other part has none.
 */
export function deployRefOf(
  deploy: ExtractorDeploy,
  quad: GearQuad,
): ((group: Group | null) => void) | undefined {
  const part = deployingExtractorPartOf(quad)
  if (part === null) return undefined
  const key = `${quad.itemId} ${quad.partId} ${String(quad.mirrorY)}`
  return (group) => {
    holdDeployingGroup(deploy, key, group === null ? null : { quad, part, group, fraction: FOLDED })
  }
}

export function stepExtractorDeploy(
  deploy: ExtractorDeploy,
  tick: number,
  fractionOf: (itemId: string) => number,
): void {
  if (tick === deploy.posedTick) return
  deploy.posedTick = tick
  poseEachToItsWork(deploy, fractionOf)
}

function holdDeployingGroup(
  deploy: ExtractorDeploy,
  key: string,
  held: DeployingGroup | null,
): void {
  if (held === null) deploy.groups.delete(key)
  else deploy.groups.set(key, held)
  deploy.posedTick = null
}

function poseEachToItsWork(deploy: ExtractorDeploy, fractionOf: (itemId: string) => number) {
  deploy.groups.forEach((held) => poseAtFraction(held, fractionOf(held.quad.itemId)))
}

function poseAtFraction(held: DeployingGroup, fraction: number): void {
  if (fraction === held.fraction) return
  held.fraction = fraction
  const { pivot, turn } = deployedPivotOf(held.quad, held.part, fraction)
  held.group.position.set(pivot[0], pivot[1], 0)
  held.group.rotation.z = turn
}
