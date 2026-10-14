/**
 * Paints the slices' look (ticket 389, `vehicleLooks`) on every part of the local vehicle, the
 * kernel's own and the slices' pieces alike, after each part has written its own pose and glow
 * this frame (`VEHICLE_LOOK_FRAME_PRIORITY`): the tint multiplied into the part's colour, the
 * opacity into its own (its mask cut-off with it, so a see-through part keeps its outline), and a
 * glow in a colour added on the named part slots. Each material's own values are kept the first
 * time it is seen and again whenever React sets them anew, so a plain look puts every part back
 * exactly as it draws itself. Lit parts only (`MeshStandardMaterial`): the heat shimmer and the
 * outline keep their own look; the outline takes the look's outline colour. Nothing is allocated per frame once each colour has been parsed.
 */
import { Color, Mesh, MeshStandardMaterial, type MeshBasicMaterial, type Object3D } from 'three'
import { slotOfPartId } from '../systems/art/artIds'
import type { DrawnVehicleLook } from '../systems/render/vehicleLookFold'

/** A part material as it draws itself, and the colours this painter last gave it. */
interface PartBase {
  slot: string
  colour: Color
  emissive: Color
  opacity: number
  alphaTest: number
  isTransparent: boolean
  paintedColour: Color
  paintedEmissive: Color
}

const SOLID = 1
const bases = new WeakMap<MeshStandardMaterial, PartBase>()
const parsedColours = new Map<string, Color>()
const painting: { look: DrawnVehicleLook | null } = { look: null }

export function paintVehicleLook(root: Object3D | null, look: DrawnVehicleLook): void {
  if (root === null) return
  painting.look = look
  root.traverse(paintPart)
}

/** Shows the outline group in the look's outline colour, or hides it when the look has none. */
export function showVehicleOutline(
  outline: Object3D | null,
  material: MeshBasicMaterial,
  look: DrawnVehicleLook,
): void {
  if (outline === null) return
  outline.visible = look.outline !== null
  if (look.outline !== null) material.color.copy(colourOf(look.outline))
}

function paintPart(object: Object3D): void {
  const look = painting.look
  const material = litMaterialOf(object)
  if (look === null || material === null) return
  const base = baseOf(material, object.name)
  washPart(material, base, look)
  seeThroughPart(material, base, look)
  glowPart(material, base, look)
}

function litMaterialOf(object: Object3D): MeshStandardMaterial | null {
  if (!(object instanceof Mesh)) return null
  return object.material instanceof MeshStandardMaterial ? object.material : null
}

/** Kept on first sight; a colour React set since the last paint replaces the kept one. */
function baseOf(material: MeshStandardMaterial, partId: string): PartBase {
  const base = bases.get(material) ?? keepBase(material, partId)
  if (!material.color.equals(base.paintedColour)) base.colour.copy(material.color)
  if (!material.emissive.equals(base.paintedEmissive)) base.emissive.copy(material.emissive)
  return base
}

function keepBase(material: MeshStandardMaterial, partId: string): PartBase {
  const base: PartBase = {
    slot: partId === '' ? '' : slotOfPartId(partId),
    colour: material.color.clone(),
    emissive: material.emissive.clone(),
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    isTransparent: material.transparent,
    paintedColour: material.color.clone(),
    paintedEmissive: material.emissive.clone(),
  }
  bases.set(material, base)
  return base
}

function washPart(material: MeshStandardMaterial, base: PartBase, look: DrawnVehicleLook): void {
  material.color.copy(base.colour)
  if (look.tint !== null) material.color.multiply(colourOf(look.tint))
  base.paintedColour.copy(material.color)
}

/** Blending toggles only when the look turns see-through or solid, so the shader rebuilds then. */
function seeThroughPart(
  material: MeshStandardMaterial,
  base: PartBase,
  look: DrawnVehicleLook,
): void {
  const isTransparent = base.isTransparent || look.opacity < SOLID
  if (material.transparent !== isTransparent) markBlending(material, isTransparent)
  material.opacity = base.opacity * look.opacity
  material.alphaTest = base.alphaTest * look.opacity
}

function markBlending(material: MeshStandardMaterial, isTransparent: boolean): void {
  material.transparent = isTransparent
  material.needsUpdate = true
}

/** Added to the glow the part's own mesh wrote this frame, in the look's colour. */
function glowPart(material: MeshStandardMaterial, base: PartBase, look: DrawnVehicleLook): void {
  material.emissive.copy(base.emissive)
  for (const glow of look.glows) {
    if (base.slot === '' || !glow.slots.includes(base.slot)) continue
    material.emissive.copy(colourOf(glow.colour))
    material.emissiveIntensity += glow.glow
  }
  base.paintedEmissive.copy(material.emissive)
}

/** Each `#rrggbb` parsed once: looks name a handful of colours. */
function colourOf(hex: string): Color {
  const parsed = parsedColours.get(hex) ?? new Color(hex)
  parsedColours.set(hex, parsed)
  return parsed
}
