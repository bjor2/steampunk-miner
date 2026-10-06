/**
 * The slices' panels of one HUD slot (feature-slices.md 3.14), in id order, drawn right after the
 * slot's kernel component, so a slice adds HUD markup without editing `HudView`. Each panel reads
 * its own slice store; an empty slot draws nothing.
 */
import { hudPanelsOf, type HudSlot } from '../registries/hudPanels'

export function SlicePanels({ slot }: { slot: HudSlot }) {
  return (
    <>
      {hudPanelsOf(slot).map(({ id, Panel }) => (
        <Panel key={id} />
      ))}
    </>
  )
}
