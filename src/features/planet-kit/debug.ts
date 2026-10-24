/**
 * The planet-kit debug actions (feature-slices.md 3.14, ticket 823):
 * `steampunkDebug.features['planet-kit'].placeContainer({ tx, ty, ore, coreFragments, kind,
 * ownerId })` places a container with that cargo on this planet through
 * `debug.planet-kit.placeContainer`, so it replays and logs `debug_command_applied` (the kind
 * defaults to `cache_crate`, the owner to the local player, the cargo to none: ore units per tier,
 * as numbers or decimal text). `.containers()` reads the rows the markers and the list draw.
 * `.showKitSockets()` / `.hideKitSockets()` hang the kit tools' placeholder parts on the car and
 * take them off (presentation only), and `.kitSockets()` lists the sockets.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { useGameStore } from '../../store/gameStore'
import { readContainerRows } from './store/containerReads'
import { hideKitSockets, showKitSockets, useKitSocketStore } from './store/kitSocketStore'
import { KIT_SOCKETS } from './systems/kitSockets'

const CACHE_CRATE = 'cache_crate'
const NOT_A_PLACEMENT =
  'placeContainer takes { tx, ty } whole tiles, ore units per tier, and optional kind, ownerId, coreFragments'

function placeContainer(spec: unknown): DebugResult {
  if (!isPlacement(spec)) return { ok: false, problems: [NOT_A_PLACEMENT] }
  return submitSliceDebugCommand({
    type: 'debug.planet-kit.placeContainer',
    payload: {
      kind: spec.kind ?? CACHE_CRATE,
      ownerId: spec.ownerId ?? useGameStore.getState().playerId,
      tx: spec.tx,
      ty: spec.ty,
      ore: oreTextOf(spec.ore ?? {}),
      coreFragments: spec.coreFragments ?? 0,
    },
  })
}

interface Placement {
  tx: number
  ty: number
  ore?: Readonly<Record<string, number | string>>
  coreFragments?: number
  kind?: string
  ownerId?: string
}

function isPlacement(spec: unknown): spec is Placement {
  if (typeof spec !== 'object' || spec === null) return false
  const { tx, ty } = spec as Record<string, unknown>
  return Number.isSafeInteger(tx) && Number.isSafeInteger(ty)
}

/** Counts cross JSON as decimal text (decision #5); the command refuses anything else. */
function oreTextOf(ore: Readonly<Record<string, number | string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(ore).map(([tier, units]) => [tier, String(units)]))
}

function okAfter(act: () => void): DebugResult {
  act()
  return { ok: true }
}

export const planetKitDebugActions: Readonly<Record<string, DebugAction>> = {
  placeContainer,
  containers: () => ({ ok: true, containers: readContainerRows() }),
  showKitSockets: () => okAfter(showKitSockets),
  hideKitSockets: () => okAfter(hideKitSockets),
  kitSockets: () => ({
    ok: true,
    areShown: useKitSocketStore.getState().areShown,
    sockets: KIT_SOCKETS.map(({ itemId, attach }) => ({ itemId, attach })),
  }),
}
