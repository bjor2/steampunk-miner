/** The artefact cache's command intents (#46), built in one place for input, screens and debug. */
import type { CommandIntent } from '../authority/authorityCommand'

export function openArtefactCacheCommand(): CommandIntent<'openArtefactCache'> {
  return { type: 'openArtefactCache', payload: {} }
}

export function chooseArtefactCommand(optionId: string): CommandIntent<'chooseArtefact'> {
  return { type: 'chooseArtefact', payload: { optionId } }
}

/** A scenario or debug start that already holds `optionId`. */
export function setArtefactCommand(optionId: string): CommandIntent<'debug.setArtefact'> {
  return { type: 'debug.setArtefact', payload: { optionId } }
}
