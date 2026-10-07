import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import { stateDigest } from '../authority/stateDigest'
import { formatAmount } from '../displayAmount'
import { div, floor, fromCanonical, fromSafeInteger, mul, toCanonical, type Money } from '../money'
import {
  describeItem,
  ITEM_DESCRIBER_REGISTRY,
  type ItemCtx,
  type ItemDescriberProvider,
  type ItemDescription,
  type ItemRef,
} from './itemDescriber'
import { itemSnapshotViewOf } from './itemSnapshotView'
import { SAVE_SECTION_REGISTRY, withSection, type SaveSection } from './saveSections'
import { addToRegistry, RegistrationRefusedError, withFreshRegistrySet } from './seal'

const DRILL: ItemRef = { kind: 'track', id: 'drill_power' }

const FLAVOUR_ONLY: ItemDescription = { flavour: 'A brass bit.', statLines: [] }

function freshState(): AuthorityState {
  return createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
}

function ctxOf(state: AuthorityState, level = 0): ItemCtx {
  return { playerId: 'p1', planetIndex: 1, level, view: itemSnapshotViewOf(state, 'p1') }
}

function providerOf(id: string, describe: ItemDescriberProvider['describe']) {
  return { id, describe }
}

/** Counts how often the provider is asked; every answer is the flavour-only description. */
function countingProvider() {
  const asked: ItemRef[] = []
  const provider = providerOf('fake.describer', (ref) => {
    asked.push(ref)
    return FLAVOUR_ONLY
  })
  return { provider, asked }
}

interface TripCounter {
  incomeItemValue: Money
  tripCap: Money
}

/** A fake slice's trip counter, as #162's drain items would keep it. */
const TRIP_SECTION: SaveSection<TripCounter> = {
  id: 'fake.trip',
  version: 1,
  scope: 'player',
  initial: { incomeItemValue: fromSafeInteger(0), tripCap: fromSafeInteger(1) },
  problems: () => [],
  toPortable: (value) => ({
    incomeItemValue: toCanonical(value.incomeItemValue),
    tripCap: toCanonical(value.tripCap),
  }),
  ofPortable: (body) => body as TripCounter,
}

/** Systems' trip-cap line on #164: `floor(100 x incomeItemValue / tripCap)` percent used. */
const TRIP_CAP_DESCRIBER = providerOf('fake.describer', (_ref, ctx) => {
  const trip = ctx.view.section(TRIP_SECTION)
  const used = floor(div(mul(trip.incomeItemValue, fromSafeInteger(100)), trip.tripCap))
  return { flavour: 'A drain.', statLines: [], unlock: `Trip cap ${formatAmount(used)}% used` }
})

describe('item describer registry', () => {
  it('describes nothing when no provider is registered, so the card draws today’s row', () => {
    const description = withFreshRegistrySet(
      () => undefined,
      () => describeItem(DRILL, ctxOf(freshState())),
    )
    expect(description).toBeNull()
  })

  it("answers with the one provider's description of the ref", () => {
    const description = withFreshRegistrySet(
      () =>
        addToRegistry(
          ITEM_DESCRIBER_REGISTRY,
          'fake',
          providerOf('fake.describer', (ref) => ({ flavour: `About ${ref.id}.`, statLines: [] })),
        ),
      () => describeItem(DRILL, ctxOf(freshState())),
    )
    expect(description?.flavour).toBe('About drill_power.')
  })

  it('refuses a second provider at seal time', () => {
    const fillTwo = () => {
      addToRegistry(ITEM_DESCRIBER_REGISTRY, 'one', countingProvider().provider)
      addToRegistry(
        ITEM_DESCRIBER_REGISTRY,
        'two',
        providerOf('two.describer', () => null),
      )
    }
    expect(() => withFreshRegistrySet(fillTwo, () => undefined)).toThrow(RegistrationRefusedError)
  })

  it('asks the provider once per ref, level and planet on one snapshot', () => {
    const { provider, asked } = countingProvider()
    const state = freshState()
    withFreshRegistrySet(
      () => addToRegistry(ITEM_DESCRIBER_REGISTRY, 'fake', provider),
      () => {
        describeItem(DRILL, ctxOf(state))
        describeItem(DRILL, ctxOf(state))
        describeItem(DRILL, ctxOf(state, 1))
        describeItem({ ...DRILL, grade: 3 }, ctxOf(state))
      },
    )
    expect(asked).toEqual([DRILL, DRILL, { ...DRILL, grade: 3 }])
  })

  it('asks again for a new snapshot, so a line reading the snapshot never goes stale', () => {
    const { provider, asked } = countingProvider()
    withFreshRegistrySet(
      () => addToRegistry(ITEM_DESCRIBER_REGISTRY, 'fake', provider),
      () => [freshState(), freshState()].forEach((state) => describeItem(DRILL, ctxOf(state))),
    )
    expect(asked).toHaveLength(2)
  })

  it('lets a trip cap line read its counter from the snapshot view without touching the state', () => {
    const outcome = withFreshRegistrySet(
      () => {
        addToRegistry(SAVE_SECTION_REGISTRY, 'fake', TRIP_SECTION)
        addToRegistry(ITEM_DESCRIBER_REGISTRY, 'fake', TRIP_CAP_DESCRIBER)
      },
      () => {
        const counter = { incomeItemValue: fromCanonical('62.9'), tripCap: fromSafeInteger(100) }
        const state = withSection(freshState(), 'p1', TRIP_SECTION, counter)
        const digest = stateDigest(state)
        const description = describeItem({ kind: 'module', id: 'fake.drain' }, ctxOf(state))
        return { line: description?.unlock, isUnchanged: stateDigest(state) === digest }
      },
    )
    expect(outcome).toEqual({ line: 'Trip cap 62% used', isUnchanged: true })
  })

  it('hands a describer a frozen view that carries no authority state', () => {
    const view = itemSnapshotViewOf(freshState(), 'p1')
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.keys(view).sort()).toEqual([
      'dockedBay',
      'levels',
      'planetIndex',
      'playerId',
      'section',
      'wallet',
    ])
  })
})
