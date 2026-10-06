import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contactSheetFiles } from './contactSheet'
import { manifestEntryTextOf } from './iconFiles'
import { iconEntries } from './iconSet'
import { iconSvgOf } from './iconSvg'

// The shipped icons are written from the set by `npm run art:icons`; a stale or hand-edited file
// fails here, so the frames and colours of #158 never drift from the rule that draws them.

const REPO = new URL('../../../../', import.meta.url)

const fileText = (relativePath: string): string | null => {
  const url = new URL(relativePath, REPO)
  return existsSync(url) ? readFileSync(url, 'utf8') : null
}

describe('icon files (npm run art:icons)', () => {
  it('ships every icon of the set as the SVG the composer writes', () => {
    const stale = iconEntries()
      .filter((entry) => fileText(`src/ui/icons/${entry.id}.svg`) !== iconSvgOf(entry))
      .map((entry) => entry.id)
    expect(stale, 'run npm run art:icons').toEqual([])
  })

  it('lists every icon in the art manifest as a final vector asset', () => {
    const stale = iconEntries()
      .filter((entry) => fileText(`art/assets/${entry.id}.json`) !== manifestEntryTextOf(entry))
      .map((entry) => entry.id)
    expect(stale, 'run npm run art:icons').toEqual([])
  })

  it('keeps the committed contact sheet current', () => {
    for (const [relativePath, text] of Object.entries(contactSheetFiles())) {
      expect(fileText(relativePath), `${relativePath}: run npm run art:icons`).toBe(text)
    }
  })
})
