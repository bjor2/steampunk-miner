import { describe, expect, it } from 'vitest'
import {
  aimScreenView,
  createScreenView,
  projectOntoScreen,
  type CameraFrame,
  type ScreenPoint,
} from './screenProjection'

const FRAME: CameraFrame = {
  centreX: 100,
  centreY: -40,
  angle: 0,
  pixelsPerMetre: 50,
  widthPixels: 1280,
  heightPixels: 800,
}

function projected(frame: CameraFrame, x: number, y: number): ScreenPoint & { isOn: boolean } {
  const view = createScreenView()
  aimScreenView(view, frame)
  const out = { x: 0, y: 0 }
  const isOn = projectOntoScreen(view, { x, y }, out)
  return { ...out, isOn }
}

describe('screen projection', () => {
  it('puts the point under the camera at the middle of the canvas', () => {
    expect(projected(FRAME, 100, -40)).toEqual({ x: 640, y: 400, isOn: true })
  })

  it('draws a point one metre up and right at the zoom to the right of and above the middle', () => {
    expect(projected(FRAME, 101, -39)).toEqual({ x: 690, y: 350, isOn: true })
  })

  it("turns the world under a rolled camera, so the camera's up points up the screen", () => {
    // Rolled a quarter turn counter-clockwise, the camera's up is world -x.
    const point = projected({ ...FRAME, angle: Math.PI / 2 }, 98, -40)
    expect(point.x).toBeCloseTo(640)
    expect(point.y).toBeCloseTo(300)
  })

  it('says a point past any edge of the canvas is offscreen', () => {
    expect(projected(FRAME, 100 + 13, -40).isOn).toBe(false)
    expect(projected(FRAME, 100 - 13, -40).isOn).toBe(false)
    expect(projected(FRAME, 100, -40 + 9).isOn).toBe(false)
    expect(projected(FRAME, 100, -40 - 9).isOn).toBe(false)
  })

  it('holds no point on screen before the first camera frame', () => {
    const view = createScreenView()
    expect(projectOntoScreen(view, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false)
  })
})
