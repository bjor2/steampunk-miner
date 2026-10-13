/**
 * The artefact icon id (#158), apart from the icon set: the artefact options registry (#324) names
 * each card's icon from here, and the icon set reaches the authority rules through the settings
 * (`input/preferences`), so reading the id from `iconSet.ts` closed an import cycle (#350).
 */
import { kebabOf } from '../artNaming'

/** `artefact.ore_whisper` draws as `icon-artefact-ore-whisper`. */
export function artefactIconIdOf(artefactId: string): string {
  return `icon-artefact-${kebabOf(artefactId.replace(/^artefact\./, ''))}`
}
