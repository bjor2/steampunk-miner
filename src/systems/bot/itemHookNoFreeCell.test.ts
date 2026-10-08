import { describe, expect, it } from 'vitest'
import { setVehicleLoadoutCommand } from '../authority/loadoutCommands'
import { contentOf } from '../registries/content'
import { NO_FREE_CELL_PLANETS, noFreeCellLineOf, noFreeCellRunsOn } from './noFreeCellRuns'

// #281's exact check for the item hooks (GD lock on #206, VS pin 1; ticket 323): with every
// registered combo owned, none slotted, no slot pressed and drive 0, the bot mines exactly the
// bare run's cells, ticks and ore value on planets 7 and 10 of the three pacing seeds. Twists are
// the run's one held artefact (GD decision 3), so the twist build runs the harness once per twist.
// Long: twelve bot runs, for the box Tester; nothing to compare until a slice registers a combo.

const TIMEOUT_MS = 60 * 60 * 1000

/** Every vehicle item a combo slice registered, by its `combo.` catalogue id. */
function comboItemIds(): string[] {
  return contentOf('vehicle-item')
    .map((item) => item.id)
    .filter((id) => id.startsWith('combo.'))
}

describe('item hooks leave the dig alone (no free cell, #281 check)', () => {
  it.skipIf(comboItemIds().length === 0).each(NO_FREE_CELL_PLANETS)(
    'mines exactly the bare cells on planet %i with every combo owned and no slot pressed',
    (planet) => {
      const setups = {
        bare: [setVehicleLoadoutCommand({})],
        owned: [setVehicleLoadoutCommand({}, comboItemIds())],
      }
      for (const runs of noFreeCellRunsOn(planet, setups)) {
        console.log(noFreeCellLineOf(runs))
        expect({ seed: runs.seed, ...runs.owned }).toEqual({ seed: runs.seed, ...runs.bare })
      }
    },
    TIMEOUT_MS,
  )
})
