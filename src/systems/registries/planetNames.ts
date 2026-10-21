/**
 * Each planet's display name (ticket 702, spec #678; Planet & Narrative's copy): the `ores` slice
 * owns the planet registry row (ticket 642), so it names planets 1 to 7 from their rows and every
 * later planet from its generated fallback. One provider at most; with none, a planet keeps the
 * shipped `Planet {n}`, so a menu reading here never shows a blank.
 *
 * Client-side presentation: nothing here reaches a command, a snapshot, a log line or a digest.
 */
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface PlanetNameProvider {
  id: string
  /** The planet's display name, at most `PLANET_NAME_CHARACTERS_MAX` characters. */
  nameOf(planetIndex: number): string
}

export const PLANET_NAME_REGISTRY = defineOneProviderRegistry<PlanetNameProvider>('planetName')

/** The planet's display name; `Planet {n}` with no provider. */
export function planetDisplayNameOf(planetIndex: number): string {
  const [provider] = entriesOf(PLANET_NAME_REGISTRY)
  return provider?.nameOf(planetIndex) ?? `Planet ${planetIndex}`
}
