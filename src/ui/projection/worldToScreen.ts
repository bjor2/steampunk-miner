/**
 * The world-to-screen projector (#208): where any world point is drawn on the canvas this frame,
 * for DOM laid over the picture (the HUD overlay's cards, #176 and #178, and a later marker layer).
 * The scene's projector feed publishes each rendered frame once the camera and the bodies have
 * moved, then every `onFrame` listener runs, so a card placed from a listener sits on the picture
 * that frame draws: no lag frame.
 *
 * A frame registry, never React or the store (CLAUDE.md frame rules). `project` hands back one
 * shared point that the next call overwrites, so it never allocates; copy it to keep it.
 */
import {
  aimScreenView,
  createScreenView,
  projectOntoScreen,
  type CameraFrame,
  type ScreenPoint,
  type Vec2,
} from '../../systems/render/screenProjection'

export type { ScreenPoint, Vec2 }

const view = createScreenView()
const projected: ScreenPoint = { x: 0, y: 0 }
const frameListeners = new Set<() => void>()

/** The canvas pixel `world` is drawn at this frame, or null when it is offscreen. */
export function project(world: Vec2): ScreenPoint | null {
  return projectOntoScreen(view, world, projected) ? projected : null
}

/** Calls `listener` once per rendered frame, after the camera moved; returns the unsubscribe. */
export function onFrame(listener: () => void): () => void {
  frameListeners.add(listener)
  return () => frameListeners.delete(listener)
}

/** The projector feed's one call per rendered frame, after the camera moved, before the draw. */
export function publishCameraFrame(frame: CameraFrame): void {
  aimScreenView(view, frame)
  frameListeners.forEach(callFrameListener)
}

function callFrameListener(listener: () => void): void {
  listener()
}
