/**
 * How the kernel spray layer takes requests (ticket 348): every `requestSpray` from now on is
 * admitted into its pool, measured from the pool's render origin, and tallied in `sprayPresence`.
 */
import { listenForSprays } from '../store/sprayRequests'
import { admitSpray, type SprayOrigin, type SprayPool } from '../systems/render/sprayPool'
import { sprayPresence } from './sprayPresence'

/** Returns the call that stops admitting. */
export function admitRequestedSprays(pool: SprayPool, origin: SprayOrigin): () => void {
  return listenForSprays((request) => admitSpray(pool, request, origin, sprayPresence))
}
