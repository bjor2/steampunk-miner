/**
 * Hands every batch of authority events to the combo tones while the HUD is drawn (ticket 373,
 * `store/comboSounds.ts`). It draws nothing: a HUD panel is the slice's one mount beside the game.
 */
import { useEffect } from 'react'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { playComboSounds } from '../store/comboSounds'

export function ComboSoundFeed() {
  useEffect(() => listenForDomainEvents(playComboSounds), [])
  return null
}
