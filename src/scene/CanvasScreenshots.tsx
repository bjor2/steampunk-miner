/**
 * Answers a debug run's screenshot requests (#123) with the frame `RenderPipeline` has just drawn.
 * Presentation only: it reads the canvas, never the store or the authority.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { answerScreenshotRequests, mountScreenshotCanvas } from './canvasScreenshots'

/** After `RenderPipeline` (priority 1) has drawn the frame. */
const AFTER_RENDER_PRIORITY = 2

export function CanvasScreenshots() {
  const canvas = useThree((state) => state.gl.domElement)
  useEffect(mountScreenshotCanvas, [canvas])
  useFrame(() => answerScreenshotRequests(canvas), AFTER_RENDER_PRIORITY)
  return null
}
