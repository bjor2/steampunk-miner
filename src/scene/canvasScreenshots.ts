/**
 * Screenshots of the game canvas for a debug run (#123: "screenshots on planet change and budget
 * breach"). A request waits for the next drawn frame: `CanvasScreenshots` answers it right after
 * `RenderPipeline` drew, in the same animation frame, because a WebGL canvas without
 * `preserveDrawingBuffer` only holds its picture until the browser composites it. `toBlob` copies
 * the picture when called and encodes the PNG off the frame. While no canvas is mounted a request
 * answers null at once, so nothing waits on a scene that is not there.
 */

type ScreenshotAnswer = (png: Uint8Array | null) => void

const screenshots = { isCanvasMounted: false, waiting: [] as ScreenshotAnswer[] }

/** The canvas as PNG bytes after its next frame; null while no canvas draws or encoding fails. */
export function requestCanvasScreenshot(): Promise<Uint8Array | null> {
  if (!screenshots.isCanvasMounted) return Promise.resolve(null)
  return new Promise((resolve) => screenshots.waiting.push(resolve))
}

/** Called by the mounted canvas; the returned call answers anything still waiting with null. */
export function mountScreenshotCanvas(): () => void {
  screenshots.isCanvasMounted = true
  return () => {
    screenshots.isCanvasMounted = false
    answerWaiting(screenshots.waiting.splice(0), null)
  }
}

/** Every frame, after the frame is drawn; costs one length check when nothing waits. */
export function answerScreenshotRequests(canvas: HTMLCanvasElement): void {
  if (screenshots.waiting.length === 0) return
  const answers = screenshots.waiting.splice(0)
  canvas.toBlob((blob) => void answerWithPng(answers, blob), 'image/png')
}

async function answerWithPng(answers: ScreenshotAnswer[], blob: Blob | null): Promise<void> {
  const png = blob === null ? null : new Uint8Array(await blob.arrayBuffer())
  answerWaiting(answers, png)
}

function answerWaiting(answers: readonly ScreenshotAnswer[], png: Uint8Array | null): void {
  answers.forEach((answer) => answer(png))
}
