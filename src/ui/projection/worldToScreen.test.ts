import { afterEach, describe, expect, it } from 'vitest'
import { createCameraTurn, stepCameraTurn } from '../../systems/render/cameraTurn'
import { createScreenPlacement, placeAtWorldPoint, type PlaceableElement } from './screenPlacement'
import { onFrame, project, publishCameraFrame } from './worldToScreen'

// The projector seam (#208): the scene publishes each camera frame, then overlay panels place
// themselves. A fake panel stands in for a DOM card: an object with the two styles it writes.

const WIDTH = 1280
const HEIGHT = 800
const PIXELS_PER_METRE = 64
const PLANET_RADIUS_M = 400
const SURFACE_SPEED_M_PER_S = 12
const MIDDLE = `translate3d(${WIDTH / 2}px, ${HEIGHT / 2}px, 0)`

let unsubscribes: (() => void)[] = []

afterEach(() => {
  unsubscribes.forEach((unsubscribe) => unsubscribe())
  unsubscribes = []
})

function createFakeCard(): PlaceableElement {
  return { style: { transform: '', visibility: '' } }
}

function publishFrameOver(x: number, y: number, angle = 0): void {
  publishCameraFrame({
    centreX: x,
    centreY: y,
    angle,
    pixelsPerMetre: PIXELS_PER_METRE,
    widthPixels: WIDTH,
    heightPixels: HEIGHT,
  })
}

/** Drives the vehicle round the planet for two seconds at `fps`; the card's transform per frame. */
function cardTransformsWhileDriving(fps: number): string[] {
  const vehicle = { x: 0, y: PLANET_RADIUS_M }
  const card = createFakeCard()
  const placement = createScreenPlacement()
  unsubscribes.push(onFrame(() => placeAtWorldPoint(card, placement, vehicle)))
  const turn = createCameraTurn()
  const transforms: string[] = []
  for (let frame = 1; frame <= fps * 2; frame++) {
    const arc = (SURFACE_SPEED_M_PER_S * frame) / fps / PLANET_RADIUS_M
    vehicle.x = PLANET_RADIUS_M * Math.sin(arc)
    vehicle.y = PLANET_RADIUS_M * Math.cos(arc)
    stepCameraTurn(turn, vehicle, 'rotating', 1 / fps)
    publishFrameOver(vehicle.x, vehicle.y, turn.angle)
    transforms.push(card.style.transform)
  }
  return transforms
}

describe('world-to-screen projector', () => {
  it.each([30, 60, 144])(
    'keeps a card on the driving vehicle in every frame at %i fps, with no lag frame',
    (fps) => {
      const transforms = cardTransformsWhileDriving(fps)
      expect(new Set(transforms)).toEqual(new Set([MIDDLE]))
    },
  )

  it('places a card at an arbitrary world point, such as a shop beside the vehicle', () => {
    const card = createFakeCard()
    unsubscribes.push(
      onFrame(() => placeAtWorldPoint(card, createScreenPlacement(), { x: 3, y: 102 })),
    )
    publishFrameOver(0, 100)
    expect(card.style.transform).toBe(`translate3d(${640 + 3 * 64}px, ${400 - 2 * 64}px, 0)`)
  })

  it('returns null for a point offscreen', () => {
    publishFrameOver(0, 100)
    expect(project({ x: 0, y: 100 })).toEqual({ x: 640, y: 400 })
    expect(project({ x: 30, y: 100 })).toBeNull()
    expect(project({ x: 0, y: 90 })).toBeNull()
  })

  it('hides a card while its point is offscreen and shows it again when it returns', () => {
    const card = createFakeCard()
    const placement = createScreenPlacement()
    const shop = { x: 0, y: 100 }
    unsubscribes.push(onFrame(() => placeAtWorldPoint(card, placement, shop)))
    publishFrameOver(50, 100)
    expect(card.style.visibility).toBe('hidden')
    publishFrameOver(0, 100)
    expect(card.style).toEqual({ transform: MIDDLE, visibility: '' })
  })

  it('stops calling a listener once it unsubscribes', () => {
    let calls = 0
    const unsubscribe = onFrame(() => calls++)
    publishFrameOver(0, 0)
    unsubscribe()
    publishFrameOver(0, 0)
    expect(calls).toBe(1)
  })
})
