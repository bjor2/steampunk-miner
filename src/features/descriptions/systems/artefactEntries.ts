/**
 * The three artefacts' card entries (#46; #164: picked, not bought, but the same card). The digits
 * of their kernel `summary` lines show here as stat lines read from the rules' own numbers, and the
 * flavour is prose in this side table. The kernel summaries stay as they are, for the empty fast
 * path (TD's Q1 confirmation on #164).
 */
import { ORE_WHISPER_RANGE_TILES, ORE_WHISPER_ROCK_TILES } from '../../../constants/scene'
import { ARTEFACT_ID } from '../../../systems/artefacts/artefactOptions'
import { ECONOMY } from '../../../systems/economy/economy'
import { artefactItemOf } from '../../../systems/registries/kernelItems'
import { fixedLine, kernelEntryOf, type DescribedEntry } from './kernelEntry'

/**
 * `breathing_room` braces the first collapse warning once per dock cycle: a fresh pick and every
 * dock set its one brace (`artefactRules.ts` `heldArtefactOf` and `restoreBreathingRoom`, #46).
 */
const BRACES_PER_DOCK_CYCLE = 1

export function artefactEntries(): readonly DescribedEntry[] {
  return [
    kernelEntryOf(
      artefactItemOf(ARTEFACT_ID.oreWhisper),
      'A listening coil that makes nearby ore glow through a skin of rock.',
      [
        fixedLine('Glow range in metres', 'linearInt', () => ORE_WHISPER_RANGE_TILES),
        fixedLine('Sees through rock in metres', 'linearInt', () => ORE_WHISPER_ROCK_TILES),
      ],
    ),
    kernelEntryOf(
      artefactItemOf(ARTEFACT_ID.breathingRoom),
      'Spring-loaded props that brace a groaning tunnel before it gives way.',
      [fixedLine('Braces per dock cycle', 'linearInt', () => BRACES_PER_DOCK_CYCLE)],
    ),
    kernelEntryOf(
      artefactItemOf(ARTEFACT_ID.assayBeacon),
      'A Guild seal that vouches for shallow ore at the mid-band price.',
      [fixedLine('Shallow ore sells as band', 'linearInt', () => ECONOMY.prices.assayBeaconBand)],
    ),
  ]
}
