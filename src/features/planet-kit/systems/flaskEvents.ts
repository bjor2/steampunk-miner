/**
 * The command, domain event and rejection reasons the Damp Flask's uncork adds (ticket 881; the
 * TD's seam on #850 as amended for the HS's point 3), by augmentation, never by editing the
 * kernel's lists; and the event body its rule builds. The event names the g the spent flask was
 * bought at, the tick the flask closes at, the flasks still carried and the cell it clears round.
 */
import { toIndexText } from '../../../systems/starMap/planetAddress'
import type { TilePoint } from '../../../systems/world/tileGrid'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    /** Uncork one carried Damp Flask, the lowest g first: its drain factor holds for its window. */
    'planet-kit.uncork_flask': Record<string, never>
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'planet-kit.FlaskUncorked': {
      playerId: string
      itemId: string
      /** The g the spent flask was bought at, as index text. */
      g: string
      /** The tick the flask closes at. */
      untilTick: number
      /** The flasks still carried, as decimal text. */
      left: string
      /** The rig's cell, the centre of the firedamp it clears; null with no pose (ticket 882). */
      at: TilePoint | null
    }
  }
  interface RejectionReasons {
    'planet-kit.no_flask': true
    'planet-kit.flask_open': true
  }
}

export interface FlaskUncork {
  playerId: string
  itemId: string
  boughtAt: bigint
  untilTick: number
  left: bigint
  at: TilePoint | null
}

export function flaskUncorkedOf(uncork: FlaskUncork) {
  return {
    type: 'planet-kit.FlaskUncorked' as const,
    playerId: uncork.playerId,
    itemId: uncork.itemId,
    g: toIndexText(uncork.boughtAt),
    untilTick: uncork.untilTick,
    left: uncork.left.toString(),
    at: uncork.at,
  }
}
