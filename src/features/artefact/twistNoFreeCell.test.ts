import { describe, expect, it } from 'vitest'
import { setArtefactCommand } from '../../systems/artefacts/artefactCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  NO_FREE_CELL_PLANETS,
  noFreeCellLineOf,
  noFreeCellRunsOn,
} from '../../systems/bot/noFreeCellRuns'
import { TWISTS } from './systems/twistCatalogue'

// #281's exact check with every twist owned (GD lock on #206, VS pin 1; ticket 329): a twist is the
// run's one held artefact (decision 3), so the harness runs once per twist. With the twist held
// and its base item owned, none slotted, no slot pressed and drive 0, the bot mines exactly the
// cells, ticks and ore value of the same run without the twist, on planets 7 and 10 of the three
// pacing seeds. Long: eighteen pairs of bot runs, for the box Tester.

const TIMEOUT_MS = 60 * 60 * 1000

const BASE_ITEM_IDS = TWISTS.map((twist) => twist.baseItemId)
const OWNED = setVehicleLoadoutCommand({}, BASE_ITEM_IDS)

describe('artefact twists leave the dig alone (no free cell, #281 check)', () => {
  it.each(
    NO_FREE_CELL_PLANETS.flatMap((planet) =>
      TWISTS.map((twist) => [twist.name, planet, twist.optionId] as const),
    ),
  )(
    'mines exactly the bare cells with %s held on planet %i and no slot pressed',
    (_name, planet, optionId) => {
      const setups = { bare: [OWNED, OWNED], owned: [OWNED, setArtefactCommand(optionId)] }
      for (const runs of noFreeCellRunsOn(planet, setups)) {
        console.log(`${optionId}: ${noFreeCellLineOf(runs)}`)
        expect({ seed: runs.seed, ...runs.owned }).toEqual({ seed: runs.seed, ...runs.bare })
      }
    },
    TIMEOUT_MS,
  )
})
