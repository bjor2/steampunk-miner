/**
 * The Damp Flask as the pacing bot plays it (ticket 881; the TD's seam on #850): the kernel's
 * `botFlasks` provider. The bot uncorks with the bar cell's own command while a flask is carried
 * and none is open, and only under `kitPolicy.flask: 'on_firedamp_entry'`.
 */
import type { BotFlaskProvider } from '../../../systems/registries/botFlasks'
import { UNCORK_FLASK_INTENT, uncorkRejectionOf } from './flaskRules'

export const PLANET_KIT_BOT_FLASK: BotFlaskProvider = {
  id: 'planet-kit.damp-flask',
  uncorkIntentOf: (state, playerId) =>
    uncorkRejectionOf(state, playerId, state.tick) === null ? UNCORK_FLASK_INTENT : null,
}
