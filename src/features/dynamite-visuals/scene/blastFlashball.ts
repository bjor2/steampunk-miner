/**
 * The flash and the fireball of a blast on one disc (D8, ticket 868): the white-hot flash for its
 * frames at the flash sprite's reach (#153 look 1, the opacity through the switches), then the same
 * disc burns as the fireball, swelling from the plan's start to its end radius in the type's spark
 * colour darkening to its soot and fading out over the plan's seconds. One mesh, one draw call,
 * stepped on the render delta.
 */
import { AdditiveBlending, CircleGeometry, Mesh, MeshBasicMaterial } from 'three'
import { mixRgb, rgbOfHex, type Rgb } from '../../../systems/render/colour'
import type { MetrePoint } from '../../../systems/render/gunLook'
import type { BlastVfxPlan } from '../systems/render/blastVfxPlan'
import { FLASH_SPRITE_COLOUR } from '../systems/render/blastLookConstants'

const FLASH_RGB = rgbOfHex(FLASH_SPRITE_COLOUR)

interface Fireball {
  seconds: number
  elapsed: number
  startRadiusM: number
  endRadiusM: number
  from: Rgb
  to: Rgb
  opacity: number
}

export interface Flashball {
  mesh: Mesh<CircleGeometry, MeshBasicMaterial>
  flashFramesLeft: number
  flashOpacity: number
  flashRadiusM: number
  fireball: Fireball | null
}

export function createFlashball(): Flashball {
  const material = new MeshBasicMaterial({
    color: FLASH_SPRITE_COLOUR,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const mesh = new Mesh(new CircleGeometry(1, 48), material)
  mesh.visible = false
  mesh.frustumCulled = false
  return { mesh, flashFramesLeft: 0, flashOpacity: 0, flashRadiusM: 0, fireball: null }
}

/** Starts a blast's flash and fireball over `centre`; a new blast takes the disc over. */
export function lightFlashball(flashball: Flashball, plan: BlastVfxPlan, centre: MetrePoint): void {
  const { flash, fireball } = plan
  flashball.mesh.position.x = centre.x
  flashball.mesh.position.y = centre.y
  flashball.flashFramesLeft = flash.opacity > 0 ? flash.frames : 0
  flashball.flashOpacity = flash.opacity
  flashball.flashRadiusM = flash.radiusM
  flashball.fireball = {
    seconds: fireball.seconds,
    elapsed: 0,
    startRadiusM: fireball.startRadiusM,
    endRadiusM: fireball.endRadiusM,
    from: rgbOfHex(fireball.fromColour),
    to: rgbOfHex(fireball.toColour),
    opacity: fireball.opacity,
  }
}

/** The fireball burns on the render delta once the flash frames are spent. */
export function stepFlashball(flashball: Flashball, dt: number): void {
  const { fireball } = flashball
  if (fireball === null || flashball.flashFramesLeft > 0) return
  fireball.elapsed += dt
  if (fireball.elapsed >= fireball.seconds) flashball.fireball = null
}

/** Shows the disc as the flash, the fireball, or nothing; counts a flash frame down. Whether shown. */
export function drawFlashball(flashball: Flashball): boolean {
  if (flashball.flashFramesLeft > 0) {
    showDisc(flashball, flashball.flashRadiusM, FLASH_RGB, flashball.flashOpacity)
    flashball.flashFramesLeft--
    return true
  }
  const { fireball } = flashball
  if (fireball === null) {
    flashball.mesh.visible = false
    return false
  }
  const burnt = fireball.elapsed / fireball.seconds
  const radiusM = fireball.startRadiusM + (fireball.endRadiusM - fireball.startRadiusM) * burnt
  showDisc(
    flashball,
    radiusM,
    mixRgb(fireball.from, fireball.to, burnt),
    fireball.opacity * (1 - burnt),
  )
  return true
}

function showDisc(flashball: Flashball, radiusM: number, [r, g, b]: Rgb, opacity: number): void {
  const { mesh } = flashball
  mesh.visible = true
  mesh.scale.set(radiusM, radiusM, 1)
  mesh.material.color.setRGB(r, g, b)
  mesh.material.opacity = opacity
}
