/**
 * The aetheric pair combos' tones (ticket 373, `systems/render/comboCues.ts`): each combo event of
 * the local player's, heard through `listenForDomainEvents`, asks the kernel's sound stage for its
 * cue on the tick it arrives, the tick its flash starts. Presentation only: it never writes a
 * store, submits a command or touches the digest.
 */
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { requestSoundCue } from '../../../store/soundCueRequests'
import { comboSoundCueIdOf } from '../systems/render/comboCues'

/** A `listenForDomainEvents` listener. */
export function playComboSounds(events: readonly DomainEvent[], playerId: string): void {
  comboCueIdsOf(events, playerId).forEach((cueId) => requestSoundCue(cueId))
}

function comboCueIdsOf(events: readonly DomainEvent[], playerId: string): string[] {
  return events
    .filter((event) => event.playerId === playerId)
    .map(comboSoundCueIdOf)
    .filter((cueId): cueId is string => cueId !== null)
}
