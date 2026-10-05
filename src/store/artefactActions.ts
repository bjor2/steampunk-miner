/**
 * The game store's artefact actions (#46), kept beside the store so it stays one reason to
 * change: opening the cache and choosing are ordinary player commands, `setArtefact` a `debug.*`
 * command that replays and logs `debug_command_applied` and throws when the authority refuses it.
 */
import {
  chooseArtefactCommand,
  openArtefactCacheCommand,
  setArtefactCommand,
} from '../systems/artefacts/artefactCommands'
import { artefactReportOf, type ArtefactReport } from '../systems/authority/heldArtefact'
import { readAuthorityState, submitCommand, submitUnlessRefused } from './authorityLink'

export interface ArtefactActions {
  /** `interact` over the live cache: the three cards open when the authority accepts it. */
  openArtefactCache(): void
  /** Takes one option for good (#46); the cards close when the authority accepts it. */
  chooseArtefact(optionId: string): void
  /** Debug: the player holds `optionId`, as if chosen from this planet's cache. */
  setArtefact(optionId: string): void
}

export function artefactActionsOf(playerIdOf: () => string): ArtefactActions {
  return {
    openArtefactCache: () => submitCommand(playerIdOf(), openArtefactCacheCommand()),
    chooseArtefact: (optionId) => submitCommand(playerIdOf(), chooseArtefactCommand(optionId)),
    setArtefact: (optionId) => submitUnlessRefused(playerIdOf(), setArtefactCommand(optionId)),
  }
}

/** What the player holds and how this planet's cache reads to them now; never logged. */
export function readArtefactReport(playerId: string): ArtefactReport {
  const state = readAuthorityState()
  return artefactReportOf(state.players[playerId].artefact, state.planet.index)
}
