import { describe, expect, it } from 'vitest'
import overlayFile from './gemOverlays.json'
import { KIND_LOOKS, patternCodeOf } from './kindLooks'
import {
  GEM_OVERLAYS,
  gemOverlayLookOf,
  gemOverlayOf,
  gemOverlayProblems,
  loadGemOverlays,
  NO_GEM_OVERLAY_LOOK,
} from './gemOverlays'

// Ticket 889 (the HS's overlay condition in the GD's Materials Expansion lock of 25 Oct): every
// overlay a planet may lay over its gems' cuts is a pattern the shader already draws, bounded so it
// never drowns the cut's facets or highlight, and read by the shader as a pattern code and a strength.

function fileWith(change: Record<string, unknown>): Record<string, unknown> {
  return { ...overlayFile, ...change }
}

function rowsWith(row: Record<string, unknown>): Record<string, unknown> {
  return fileWith({ overlays: [...overlayFile.overlays, row] })
}

describe('planet gem overlays (ticket 889)', () => {
  it('ships a catalogue of overlays, each a pattern of the kind look catalogue within the strength cap', () => {
    expect(gemOverlayProblems(overlayFile)).toEqual([])
    expect(GEM_OVERLAYS.overlays.length).toBeGreaterThanOrEqual(8)
    for (const overlay of GEM_OVERLAYS.overlays) {
      expect(KIND_LOOKS.patterns.map((pattern) => pattern.id)).toContain(overlay.pattern)
      expect(Math.abs(overlay.strength)).toBeLessThanOrEqual(GEM_OVERLAYS.strengthCap)
      expect(overlay.strength).not.toBe(0)
    }
  })

  it("reads an overlay as its pattern's shader code and its strength, and none as code 0", () => {
    const silk = gemOverlayOf('silk')
    expect(silk).not.toBeNull()
    expect(gemOverlayLookOf(silk)).toEqual({
      patternCode: patternCodeOf('silky'),
      strength: silk?.strength,
    })
    expect(gemOverlayLookOf(null)).toEqual(NO_GEM_OVERLAY_LOOK)
    expect(gemOverlayOf('no-such-overlay')).toBeNull()
  })

  it('refuses a row naming a pattern the shader cannot draw', () => {
    expect(gemOverlayProblems(rowsWith({ id: 'x', pattern: 'nope', strength: 0.1 }))).toEqual([
      'overlays[12].pattern names no pattern of the kind look catalogue',
    ])
  })

  it('refuses a strength of 0 or over the cap, since the overlay must show without drowning the cut', () => {
    expect(gemOverlayProblems(rowsWith({ id: 'x', pattern: 'smoky', strength: 0 }))).toEqual([
      'overlays[12].strength must be a signed number other than 0',
    ])
    expect(gemOverlayProblems(rowsWith({ id: 'x', pattern: 'smoky', strength: -0.9 }))).toEqual([
      'overlays[12].strength is over strengthCap 0.4',
    ])
  })

  it('refuses two rows sharing an id or a pattern, and an unknown field', () => {
    expect(gemOverlayProblems(rowsWith({ id: 'silk', pattern: 'silky', strength: 0.1 }))).toEqual([
      'two overlays share the id silk',
      'two overlays share the pattern silky',
    ])
    expect(
      gemOverlayProblems(rowsWith({ id: 'x', pattern: 'smoky', strength: 0.1, tint: '#fff' })),
    ).toEqual(['overlays[12] has the unknown field tint'])
  })

  it('refuses a file with no rows or a cap outside a share, and loads the shipped one', () => {
    expect(gemOverlayProblems(fileWith({ overlays: [] }))).toEqual([
      'overlays must be a list of at least one row',
    ])
    expect(gemOverlayProblems(fileWith({ strengthCap: 2 }))).toEqual([
      'strengthCap must be above 0 and at most 1',
    ])
    expect(() => loadGemOverlays(fileWith({ overlays: [] }))).toThrow('gemOverlays.json is refused')
    expect(loadGemOverlays(overlayFile)).toEqual(GEM_OVERLAYS)
  })
})
