/**
 * Keeps the UI in the planet's skin (spec #678, ticket 682; docs/ui/design-system.md section 14):
 * on every arrival it writes the planet palette's skinnable colours (`--color-accent`,
 * `--color-accent-soft`, `--color-glow`, `--color-dial-face`) on the page root, so frames and glows
 * take the planet's tint while every limit stays where it is. The one writer of those four.
 */
import type { Shell } from '../../shell/shell'
import { readPlanetWorld, useGameStore, type GameState } from '../../store/gameStore'
import { planetSkinStyleOf } from '../../systems/views/designTokenCss'

export function keepPlanetSkinned(shell: Shell): void {
  const skin = () => shell.setScreenStyle(planetSkinStyleOf(shownPaletteId()))
  useGameStore.subscribe((state, previous) => reskinOnArrival(state, previous, skin))
  skin()
}

/** No planet yet (the title) wears the base colours. */
function shownPaletteId(): string {
  return readPlanetWorld().params?.paletteId ?? ''
}

function reskinOnArrival(state: GameState, previous: GameState, skin: () => void): void {
  if (state.planetTier !== previous.planetTier || state.planetSeed !== previous.planetSeed) skin()
}
