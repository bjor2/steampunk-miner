import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { fromCanonical } from '../money'
import type { PlanetParams } from '../world/planetParams'
import {
  PLANET_CARD_LINE_REGISTRY,
  planetCardOf,
  type PlanetCard,
  type PlanetCardLineAnswer,
  type PlanetCardLineSource,
} from './planetCardLines'
import { addToRegistry, RegistrationRefusedError, withFreshRegistrySet } from './seal'

const MAGNETIC: PlanetCardLineAnswer = {
  tag: 'Magnetic',
  arrivalLine: 'Magnetic. Ferrous veins throw fields; the probe reads them.',
}

function sourceOf(
  featureId: string,
  answer: (params: PlanetParams) => PlanetCardLineAnswer | null,
  id = 'fake-mix.class',
): PlanetCardLineSource {
  return { id, featureId, lineOf: answer }
}

function cardWith(
  sources: readonly PlanetCardLineSource[],
  planetIndex: number,
): PlanetCard | null {
  const state = createAuthorityState({ planetIndex, planetSeed: 1, playerIds: ['p1'] })
  return withFreshRegistrySet(
    () =>
      sources.forEach((source) =>
        addToRegistry(PLANET_CARD_LINE_REGISTRY, source.id.split('.')[0], source),
      ),
    () => planetCardOf(state),
  )
}

describe('planet card lines', () => {
  it('shows a live class its tag and arrival line on its planet', () => {
    const card = cardWith([sourceOf('magnetic_planets', () => MAGNETIC)], 25)
    expect(card).toEqual({
      planetIndex: 25,
      lines: [{ sourceId: 'fake-mix.class', ...MAGNETIC, gateKind: null, values: [] }],
    })
  })

  it('adds no tag for a class that is not live yet, even when its data rows exist', () => {
    const frozen = sourceOf('frozen_planets', () => ({ tag: 'Frozen', arrivalLine: 'Cold.' }))
    expect(cardWith([frozen], 17)).toBeNull()
    expect(cardWith([sourceOf('magnetic_planets', () => MAGNETIC)], 24)).toBeNull()
  })

  it('shows no card on a planet no live source has a line for', () => {
    expect(cardWith([sourceOf('magnetic_planets', () => null)], 30)).toBeNull()
    expect(cardWith([], 25)).toBeNull()
  })

  it('shows the hazard and the gate kind only, never a held item, a vision row, a rig, a size or a counter to buy', () => {
    const overSharing = {
      ...MAGNETIC,
      gateKind: 'electrified',
      heldItem: 'galvanic probe',
      counterItem: 'grounded lining',
      visionRow: 'Grounded lining',
      unbuiltRig: 'siphon',
      dynamiteSize: 'large charge',
    }
    const card = cardWith([sourceOf('magnetic_planets', () => overSharing)], 25)
    expect(card?.lines).toEqual([
      { sourceId: 'fake-mix.class', ...MAGNETIC, gateKind: 'electrified', values: [] },
    ])
  })

  it('carries typed values, a label and a number or Money with its unit', () => {
    const toughness = { label: 'Toughness', amount: fromCanonical('1.4'), unit: '×' }
    const withValues = {
      ...MAGNETIC,
      values: [toughness, { label: 'V_p', amount: 12, unit: 'm/s' }],
    }
    const card = cardWith([sourceOf('magnetic_planets', () => withValues)], 25)
    expect(card?.lines[0].values).toEqual([toughness, { label: 'V_p', amount: 12, unit: 'm/s' }])
  })

  it('lists the lines of every live source in id order', () => {
    const later = sourceOf(
      'heat_lava',
      () => ({ tag: 'Molten', arrivalLine: 'Hot.' }),
      'b-mix.heat',
    )
    const first = sourceOf('magnetic_planets', () => MAGNETIC, 'a-mix.magnetic')
    const card = cardWith([later, first], 25)
    expect(card?.lines.map((line) => line.tag)).toEqual(['Magnetic', 'Molten'])
  })

  it('refuses to register a source whose id names an unlock id', () => {
    const naming = sourceOf('magnetic_planets', () => MAGNETIC, 'fake-mix.magnetic_planets')
    expect(() => cardWith([naming], 25)).toThrow(RegistrationRefusedError)
    expect(() => cardWith([naming], 25)).toThrow(/unlock id "magnetic_planets"/)
  })

  it('refuses a source waiting on a row the schedule does not have', () => {
    expect(() => cardWith([sourceOf('molten_planets', () => MAGNETIC)], 25)).toThrow(
      /waits on "molten_planets", no schedule row/,
    )
  })

  it('refuses a line whose text names an unlock id, never trimming it', () => {
    const preview = { ...MAGNETIC, arrivalLine: 'Bring grounded_lining before you dig.' }
    expect(() => cardWith([sourceOf('magnetic_planets', () => preview)], 25)).toThrow(
      /names the unlock id "grounded_lining"/,
    )
  })
})
