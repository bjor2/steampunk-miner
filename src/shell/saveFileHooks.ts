/**
 * Keeping a browser's saves (#470 P1-8, ticket 479), plumbing both shells share: asking the
 * browser to keep this origin's storage from eviction, the player's first tap, and a save file
 * handed to the player or picked by them. A phone gets the share sheet (Files, AirDrop, a chat),
 * everything else a download; either way the file holds the save's exact text.
 */
const COARSE_POINTER = '(pointer: coarse)'
const SAVE_FILE_TYPE = 'application/json'
const SAVE_FILE_ACCEPT = '.json,application/json'

/** `navigator.storage.persist()`; false where the browser has none or refuses. */
export async function askBrowserToKeepStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/** Runs once, on the first finger or button pressed on the page. */
export function runOnFirstTap(callback: () => void): void {
  window.addEventListener('pointerdown', callback, { once: true, capture: true })
}

export async function handOverSaveFile(fileName: string, json: string): Promise<void> {
  const file = new File([json], fileName, { type: SAVE_FILE_TYPE })
  if (isShareSheetFor(file)) return shareOrDownload(file)
  downloadFile(file)
}

/** A phone's share sheet takes files; a desktop's would only get in the way of a download. */
function isShareSheetFor(file: File): boolean {
  const isPhone = window.matchMedia(COARSE_POINTER).matches
  return isPhone && navigator.canShare?.({ files: [file] }) === true
}

/** A dismissed sheet hands nothing over; a sheet that fails falls back to the download. */
async function shareOrDownload(file: File): Promise<void> {
  try {
    await navigator.share({ files: [file] })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) downloadFile(file)
  }
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  // The download has its own copy once the click is handled.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** The picked file's text, or null once the picker is closed with no file. */
export function pickSaveFile(): Promise<string | null> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = SAVE_FILE_ACCEPT
  const picked = new Promise<string | null>((resolve, reject) => {
    input.addEventListener('change', () => void textOfPicked(input).then(resolve, reject))
    input.addEventListener('cancel', () => resolve(null))
  })
  input.click()
  return picked
}

function textOfPicked(input: HTMLInputElement): Promise<string | null> {
  const file = input.files?.[0]
  return file === undefined ? Promise.resolve(null) : file.text()
}
