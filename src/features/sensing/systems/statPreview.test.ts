import { describe, expect, it } from 'vitest'
import { statPreview, type SensingStatPreview } from './statPreview'

const PLANET = 13

function valuesOf(preview: SensingStatPreview | null): Record<string, number> {
  return Object.fromEntries((preview?.lines ?? []).map((line) => [line.stat, line.value]))
}

/** The Mark that masters the item. */
function lastMarkOf(itemId: string): number {
  let mark = 1
  while (!statPreview(itemId, mark, PLANET)!.isMastered) mark++
  return mark
}

describe('sensing stat preview', () => {
  it('shows the echo sounder as bought: 3 charges, 300 cooldown, 6 wind-up, radius 12, reveal 600', () => {
    expect(valuesOf(statPreview('power.echo_sounder', 1, PLANET))).toEqual({
      charges: 3,
      cooldown: 300,
      windup: 6,
      radius: 12,
      reveal: 600,
    })
  })

  it('gives the void sounder no radius: it maps one whole cavern', () => {
    expect(valuesOf(statPreview('power.void_sounder', 1, PLANET))).toEqual({
      charges: 2,
      cooldown: 600,
      windup: 6,
      reveal: 900,
    })
  })

  it('shows the flare mortar with its stack, range and mapped radius, and the buoy with no range', () => {
    expect(valuesOf(statPreview('consumable.flare_mortar', 1, PLANET))).toEqual({
      stack: 3,
      range: 30,
      radius: 6,
    })
    expect(valuesOf(statPreview('consumable.signal_buoy', 1, PLANET))).toEqual({
      stack: 3,
      radius: 4,
    })
  })

  it('steps cooldown, then reveal time, then charges from Mark 2 (the #165 rotation)', () => {
    const marks = [2, 3, 4].map((mark) => statPreview('power.echo_sounder', mark, PLANET)!)
    expect(marks.map((preview) => preview.stepped)).toEqual(['cooldown', 'magnitude', 'charges'])
    expect(marks.map(valuesOf)).toEqual([
      { charges: 3, cooldown: 276, windup: 6, radius: 12, reveal: 600 },
      { charges: 3, cooldown: 276, windup: 6, radius: 12, reveal: 690 },
      { charges: 4, cooldown: 276, windup: 6, radius: 12, reveal: 690 },
    ])
  })

  it('masters at 0.5x cooldown, 2x reveal and +3 charges, then steps nothing', () => {
    const last = lastMarkOf('power.echo_sounder')
    expect(valuesOf(statPreview('power.echo_sounder', last, PLANET))).toEqual({
      charges: 6,
      cooldown: 150,
      windup: 6,
      radius: 12,
      reveal: 1200,
    })
    expect(statPreview('power.echo_sounder', last + 1, PLANET)!.stepped).toBeNull()
  })

  it('steps a consumable radius, then stack, up to 2x radius and +3 crates', () => {
    expect(statPreview('consumable.signal_buoy', 2, PLANET)!.stepped).toBe('magnitude')
    expect(statPreview('consumable.signal_buoy', 3, PLANET)!.stepped).toBe('charges')
    const last = lastMarkOf('consumable.signal_buoy')
    expect(valuesOf(statPreview('consumable.signal_buoy', last, PLANET))).toEqual({
      stack: 6,
      radius: 8,
    })
  })

  it('shows each passive as bought: periscope radius 10, lens radius 6, barometer lookahead 4', () => {
    expect(valuesOf(statPreview('passive.threat_periscope', 1, PLANET))).toEqual({ radius: 10 })
    expect(valuesOf(statPreview('passive.assay_lens', 1, PLANET))).toEqual({ radius: 6 })
    expect(valuesOf(statPreview('passive.hazard_barometer', 1, PLANET))).toEqual({ lookahead: 4 })
  })

  it('steps a passive magnitude only, and masters it at twice its base (#162 4.4)', () => {
    expect(statPreview('passive.threat_periscope', 2, PLANET)!.stepped).toBe('magnitude')
    expect(statPreview('passive.threat_periscope', 3, PLANET)!.stepped).toBe('magnitude')
    const masteredValues = [
      'passive.threat_periscope',
      'passive.assay_lens',
      'passive.hazard_barometer',
    ]
      .map((itemId) => statPreview(itemId, lastMarkOf(itemId), PLANET))
      .map(valuesOf)
    expect(masteredValues).toEqual([{ radius: 20 }, { radius: 12 }, { lookahead: 8 }])
  })

  it('reads the same on every planet', () => {
    expect(statPreview('power.galvanic_probe', 4, 40)).toEqual(
      statPreview('power.galvanic_probe', 4, PLANET),
    )
  })

  it('answers null for an item of another lane', () => {
    expect(statPreview('power.mineral_drain', 1, PLANET)).toBeNull()
  })
})
