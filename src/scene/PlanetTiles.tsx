/**
 * A placeholder view of the tiles around the vehicle: one instanced square per solid tile, in a
 * flat colour per kind, refilled when the vehicle enters another tile or the world changes. It
 * stands in until Build 5 (#22) draws batched chunk meshes; the colliders are the physics halo's.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, InstancedMesh, Matrix4 } from 'three'
import { TILE_COLOURS, TILE_VIEW_RADIUS } from '../constants/scene'
import { readPlanetWorld } from '../store/gameStore'
import type { PlanetParams } from '../systems/world/planetParams'
import { CELL_KIND, isSolidCell, kindOfCell } from '../systems/world/worldCell'
import { cellAt, type WorldState } from '../systems/world/worldState'
import { vehiclePresence } from './vehiclePresence'

const SIDE = 2 * TILE_VIEW_RADIUS + 1
const CAPACITY = SIDE * SIDE

const COLOUR_BY_KIND: Readonly<Record<number, Color>> = {
  [CELL_KIND.ground]: new Color(TILE_COLOURS.ground),
  [CELL_KIND.ore]: new Color(TILE_COLOURS.ore),
  [CELL_KIND.core]: new Color(TILE_COLOURS.core),
  [CELL_KIND.indestructible]: new Color(TILE_COLOURS.indestructible),
}

interface Filled {
  tx: number
  ty: number
  world: WorldState | null
}

export function PlanetTiles() {
  const mesh = useRef<InstancedMesh>(null)
  const filled = useRef<Filled>({ tx: Number.NaN, ty: Number.NaN, world: null })
  const scratch = useMemo(() => new Matrix4(), [])

  useFrame(() => {
    const { params, world } = readPlanetWorld()
    const next = { tx: Math.floor(vehiclePresence.x), ty: Math.floor(vehiclePresence.y), world }
    if (mesh.current === null || params === null || isSameFill(filled.current, next)) return
    filled.current = next
    fillTilesAround(mesh.current, scratch, params, world, next.tx, next.ty)
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CAPACITY]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial />
    </instancedMesh>
  )
}

function isSameFill(last: Filled, next: Filled): boolean {
  return last.tx === next.tx && last.ty === next.ty && last.world === next.world
}

function fillTilesAround(
  mesh: InstancedMesh,
  scratch: Matrix4,
  params: PlanetParams,
  world: WorldState,
  centreX: number,
  centreY: number,
): void {
  let count = 0
  for (let ty = centreY - TILE_VIEW_RADIUS; ty <= centreY + TILE_VIEW_RADIUS; ty++) {
    for (let tx = centreX - TILE_VIEW_RADIUS; tx <= centreX + TILE_VIEW_RADIUS; tx++) {
      const cell = cellAt(world, params, { tx, ty })
      if (!isSolidCell(cell)) continue
      mesh.setMatrixAt(count, scratch.makeTranslation(tx + 0.5, ty + 0.5, 0))
      mesh.setColorAt(count, COLOUR_BY_KIND[kindOfCell(cell)] ?? COLOUR_BY_KIND[CELL_KIND.ground])
      count++
    }
  }
  mesh.count = count
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true
}
