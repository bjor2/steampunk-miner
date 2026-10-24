import { describe, expect, it } from 'vitest'
import { solarSystemsDebugActions } from './debug'
import { economyRowTextOf, systemEconomyRowsOf } from './systems/economyRows'
import { systemRosterOf } from './systems/systemRoster'

describe('solar-systems debug actions (ticket 775)', () => {
  it('re-prints the roster the generator draws for a system, by index text or number', () => {
    const planets = systemRosterOf(7, 2n)
    expect(solarSystemsDebugActions.rosterOf!('2', 7)).toEqual({ ok: true, planets })
    expect(solarSystemsDebugActions.rosterOf!(2, 7)).toEqual({ ok: true, planets })
  })

  it('refuses a system that is no index, a seed that is no integer and system 1', () => {
    expect(solarSystemsDebugActions.rosterOf!('02', 7)).toEqual({
      ok: false,
      problems: ['system must be a whole index from 1'],
    })
    expect(solarSystemsDebugActions.rosterOf!('2', 0.5)).toEqual({
      ok: false,
      problems: ['worldSeed must be a safe integer'],
    })
    expect(solarSystemsDebugActions.rosterOf!('1', 7)).toEqual({
      ok: false,
      problems: ['system 1 keeps its own rows: the palette draws from system 2'],
    })
  })

  it('answers a look its art row and tile, and refuses a look the palette lacks (ticket 778)', () => {
    expect(solarSystemsDebugActions.lookArtOf!('gauss-field')).toMatchObject({
      ok: true,
      art: { lookId: 'gauss-field', tileAssetId: 'ground-look-gauss-field' },
    })
    expect(solarSystemsDebugActions.lookArtOf!('no-such-look')).toEqual({
      ok: false,
      problems: ['lookId must name a palette look'],
    })
  })

  it("answers a planet's filled family copy, null copy for an empty slot, and refuses a missing place (ticket 780)", () => {
    const planet = systemRosterOf(20261024, 2n)[1]
    expect(solarSystemsDebugActions.slotCopyOf!('2', 2, 20261024)).toMatchObject({
      ok: true,
      copy: {
        familyId: 'spall_glass',
        tag: 'Spall glass',
        rigPart: { name: 'Cutting collar' },
        hoverLines: [expect.any(String), expect.stringContaining(planet.name)],
      },
    })
    expect(solarSystemsDebugActions.slotCopyOf!(2, 2, 20261024)).toEqual(
      solarSystemsDebugActions.slotCopyOf!('2', '2', 20261024),
    )
    expect(solarSystemsDebugActions.slotCopyOf!(3, 1, 20261024)).toEqual({ ok: true, copy: null })
    expect(solarSystemsDebugActions.slotCopyOf!(2, 9, 0.5)).toEqual({
      ok: false,
      problems: ['worldSeed must be a safe integer'],
    })
    expect(solarSystemsDebugActions.slotCopyOf!(2, 9, 7)).toEqual({
      ok: false,
      problems: ['system 2 holds no planet 9'],
    })
  })

  it('describes the palette', () => {
    expect(solarSystemsDebugActions.describe!()).toMatchObject({
      ok: true,
      sliceId: 'solar-systems',
      newContentSet: 'SS2-B',
      sizeClasses: ['S', 'M', 'L', 'XL'],
      lookTiles: expect.arrayContaining(['ground-look-cinder-basalt']) as unknown,
    })
  })

  it("prints a system's economy rows as canonical text with no lock problem, and refuses system 1 (ticket 776)", () => {
    const rows = systemEconomyRowsOf(20261024, 2n).map(economyRowTextOf)
    expect(solarSystemsDebugActions.economyRowsOf!(2, 20261024)).toEqual({
      ok: true,
      rows,
      lockProblems: [],
    })
    expect(rows[0]).toMatchObject({ campaignIndex: '6', arrivalStep: '1.1e+0' })
    expect(solarSystemsDebugActions.economyRowsOf!('1', 7)).toEqual({
      ok: false,
      problems: ['system 1 keeps its own rows: the palette draws from system 2'],
    })
  })
})
