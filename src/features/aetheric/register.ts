/**
 * The aetheric slice's registration (ticket 260, build 1 of the GD lock on #245): the Aetheric
 * science lane's P15, P24 and P29 nodes as `tech-node` content. The items they unlock, their
 * sales and cards come with their own builds, so until then no seller offers them and the bot
 * researches none. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { AETHERIC_TECH_NODES } from './systems/aethericNodes'

export const slice: SliceDefinition = {
  id: 'aetheric',
  register(r) {
    r.content('tech-node', AETHERIC_TECH_NODES)
  },
}
