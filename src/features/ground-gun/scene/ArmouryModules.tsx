/**
 * Bought Armoury modules drawn on their gun (ticket 321): each module's asset with its own atlas,
 * inside whichever group carries it, listed in `steampunkDebug.vehicleParts().mounted` at the
 * gun's own point while it is on the car.
 */
import { useEffect, useMemo } from 'react'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { showMountedParts } from '../../../scene/mountedPartsPresence'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { atlasMapsOf } from '../../../systems/art/assetLook'
import type { AttachId } from '../../../systems/registries/vehicleAttach'
import type { PlacedModule } from '../systems/render/armouryMounts'

interface ArmouryModulesProps {
  modules: readonly PlacedModule[]
  /** The gun's point on the vehicle, which the debug read files the modules under. */
  attachId: AttachId
  baseZ: number
}

export function ArmouryModules({ modules, attachId, baseZ }: ArmouryModulesProps) {
  useEffect(() => showModuleParts(modules, attachId), [modules, attachId])
  return (
    <>
      {modules.map((module) => (
        <ModuleQuads key={module.assetId} module={module} baseZ={baseZ} />
      ))}
    </>
  )
}

function ModuleQuads({ module, baseZ }: { module: PlacedModule; baseZ: number }) {
  const maps = useMemo(() => atlasMapsOf(SHIPPED_ART, module.assetId), [module.assetId])
  return (
    <>
      {module.quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={baseZ} />
      ))}
    </>
  )
}

/** Lists every module's parts on the car; returns the call that takes them all back. */
function showModuleParts(modules: readonly PlacedModule[], attachId: AttachId): () => void {
  const hides = modules.map((module) =>
    showMountedParts({ assetId: module.assetId, attachId }, module.quads),
  )
  return () => hides.forEach((hide) => hide())
}
