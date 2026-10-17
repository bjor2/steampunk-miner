import { describe, expect, it } from 'vitest'
import { CARVE_GEOMETRY_DEVIATIONS, carveGeometryVerdictOf } from './carveGeometryKnownRed'

// The three named deviations of ticket 537's landing bars, held under #545 (the GD 6241320435
// item 2): only the named bar of a named row is held, printed with its number; any other red
// bar fails; a named row inside the band fails until its deviation is deleted; a closed #545
// expires the marker.

const OPEN = () => null
const CLOSED = () => JSON.stringify({ closed: '2026-10-20' })
const INSIDE = { lawWorkPerMetre: 0, cellsPerMetre: 0 }

describe('carve-geometry known red (ticket 537, #545)', () => {
  it('names the three rows the ruling named', () => {
    expect(CARVE_GEOMETRY_DEVIATIONS.map((named) => `${named.track} ${named.bar}`)).toEqual([
      '3 m/s flat level lawWorkPerMetre',
      '25 m/s tilted down cellsPerMetre',
      '44 m/s tilted down cellsPerMetre',
    ])
  })

  it('holds a named row’s named bar as known red, printed with the finding', () => {
    const verdict = carveGeometryVerdictOf(
      '3 m/s flat level',
      { ...INSIDE, lawWorkPerMetre: 0.016 },
      OPEN,
    )
    expect(verdict.failures).toEqual([])
    expect(verdict.knownRed).toEqual([
      'known-red (#545): 3 m/s flat level lawWorkPerMetre misses the band against the 5 m/s rig by 0.016',
    ])
  })

  it('fails the other bar of a named row, and any bar of a row not named', () => {
    const cells = carveGeometryVerdictOf(
      '3 m/s flat level',
      { lawWorkPerMetre: 0.016, cellsPerMetre: 0.01 },
      OPEN,
    )
    expect(cells.failures).toEqual([
      '3 m/s flat level cellsPerMetre misses the band against the 5 m/s rig by 0.01',
    ])
    expect(cells.knownRed).toHaveLength(1)
    const other = carveGeometryVerdictOf(
      '8 m/s flat level',
      { ...INSIDE, lawWorkPerMetre: 0.002 },
      OPEN,
    )
    expect(other.failures).toHaveLength(1)
    expect(other.knownRed).toEqual([])
  })

  it('passes a row inside the band that is not named, and fails a named row that turned green', () => {
    expect(carveGeometryVerdictOf('8 m/s flat level', INSIDE, OPEN)).toEqual({
      failures: [],
      knownRed: [],
    })
    const green = carveGeometryVerdictOf('25 m/s tilted down', INSIDE, OPEN)
    expect(green.failures).toEqual([
      '25 m/s tilted down cellsPerMetre is inside the band but still a named deviation under #545: delete it',
    ])
  })

  it('expires once #545 closes: every miss fails, with the marker named', () => {
    const verdict = carveGeometryVerdictOf(
      '3 m/s flat level',
      { ...INSIDE, lawWorkPerMetre: 0.016 },
      CLOSED,
    )
    expect(verdict.knownRed).toEqual([])
    expect(verdict.failures[0]).toMatch(/expired: the finding closed on 2026-10-20/)
    expect(verdict.failures).toHaveLength(2)
  })
})
