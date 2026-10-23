/**
 * The star map's rules (tickets 754 and 755), the `starMap` block of economy.json: the GD lock on
 * #650 (comment 6361556890, TD architecture) and the VS input (6361573401). A planet is addressed
 * by its solar system `s` and its place `p` in it; the economy reads the campaign index
 * `g = campaignIndex(s, p)` (`starMap/campaignIndex.ts`), which advances by `systemAdvance` a system
 * ("g advancing by data J", VS), so system 1 is today's planet line.
 *
 * `systemAdvance` is provisional: no decision names its value, and ticket 759 (the jump between
 * systems) carries the J row and sets it. System 1 never reads it, so P1 onward stay byte-identical
 * whatever it holds.
 *
 * `fuel.unitsPerPlanetStep` is provisional too (ticket 755): the fuel a jump burns per planet it
 * crosses, until Systems' fuel curve and tank (ticket 756) price the hop by the destination.
 */
import type { FieldReader } from './economyFieldReader'

export interface StarMapRules {
  /** How far the campaign index moves from one solar system to the next (VS's J, provisional). */
  systemAdvance: number
  fuel: JumpFuelRules
}

export interface JumpFuelRules {
  /** Fuel units a jump burns per planet between its start and its end (provisional, ticket 756). */
  unitsPerPlanetStep: number
}

const PATH = 'starMap'

export function readStarMap(reader: FieldReader, value: unknown): StarMapRules {
  const starMap = reader.object(PATH, value)
  const read = {
    systemAdvance: reader.safeInteger(`${PATH}.systemAdvance`, starMap.systemAdvance),
    fuel: readJumpFuel(reader, starMap.fuel),
  }
  if (read.systemAdvance < 1) reader.record(`${PATH}.systemAdvance must be 1 or more`)
  return read
}

function readJumpFuel(reader: FieldReader, value: unknown): JumpFuelRules {
  const path = `${PATH}.fuel`
  const fuel = reader.object(path, value)
  const read = {
    unitsPerPlanetStep: reader.safeInteger(`${path}.unitsPerPlanetStep`, fuel.unitsPerPlanetStep),
  }
  if (read.unitsPerPlanetStep < 1) reader.record(`${path}.unitsPerPlanetStep must be 1 or more`)
  return read
}
