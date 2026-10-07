/**
 * The mining gates' debug actions (feature-slices.md 3.14, #142 "Registers"):
 * `steampunkDebug.features['mining-gates'].describe()` lists the extractors with their planet and
 * price, `.gateTableOf(7, 83921)` reads a planet's gates per band for e2e specs and balance probes,
 * `.ownsRig('rig.resonance')` reads ownership, and `.grantRig('rig.resonance')` grants one through
 * the kernel's `debug.setVehicleLoadout`, keeping every slotted and owned item, so it replays and
 * logs `debug_command_applied` like a scenario's grant.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { vehicleOf } from '../../systems/authority/authorityState'
import { toCanonical } from '../../systems/money'
import type { VehicleLoadout } from '../../systems/vehicle/loadoutState'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { oreMixFor } from '../planet-mix'
import { GATE_ROWS } from './systems/gateRows'
import { gateTableOf, type CellGate } from './systems/gateTable'
import { availableFromPlanet, ownsRig, rigNamed, rigPriceOf } from './systems/rigs'

const NOT_A_PLANET = 'gateTableOf takes a planet index from 1 and a world seed from 0'

function describe() {
  return {
    ok: true as const,
    sliceId: 'mining-gates',
    gateContentFromPlanet: GATE_ROWS.gateContentFromPlanet,
    rigs: GATE_ROWS.rigs.map((rig) => ({
      id: rig.id,
      name: rig.name,
      gateClass: rig.gateClass,
      availableFromPlanet: availableFromPlanet(rig),
      price: toCanonical(rigPriceOf(rig)),
    })),
  }
}

function gateTableOfPlanet(planetIndex: unknown, worldSeed: unknown) {
  if (!isWholeAtLeast(planetIndex, 1) || !isWholeAtLeast(worldSeed, 0)) {
    return { ok: false as const, problems: [NOT_A_PLANET] }
  }
  const table = gateTableOf(oreMixFor(planetIndex, worldSeed))
  return {
    ok: true as const,
    planetIndex,
    bands: table.bands.map((band) =>
      band.map(({ entry, gate }) => ({ ...entry, gate: plainGateOf(gate) })),
    ),
  }
}

function grantRig(rigId: unknown) {
  const rig = rigNamed(String(rigId))
  if (rig === null) return { ok: false as const, problems: [`no extractor ${String(rigId)}`] }
  const loadout = vehicleOf(readAuthorityState(), localPlayerId()).loadout
  return submitSliceDebugCommand({
    type: 'debug.setVehicleLoadout',
    payload: { slots: filledSlotsOf(loadout), owned: [...loadout.owned, rig.id] },
  })
}

function ownsRigNamed(rigId: unknown) {
  return { ok: true as const, owned: ownsRig(readAuthorityState(), localPlayerId(), String(rigId)) }
}

function filledSlotsOf(loadout: VehicleLoadout): Record<string, string> {
  return Object.fromEntries(
    Object.entries(loadout.slots).filter((slot): slot is [string, string] => slot[1] !== null),
  )
}

/** The gate as plain JSON: the extractor by id. */
function plainGateOf(gate: CellGate) {
  return gate.kind === 'rig' ? { kind: gate.kind, rigId: gate.rig.id } : gate
}

function isWholeAtLeast(value: unknown, least: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= least
}

function localPlayerId(): string {
  return useGameStore.getState().playerId
}

export const miningGatesDebugActions: Readonly<Record<string, DebugAction>> = {
  describe,
  gateTableOf: gateTableOfPlanet,
  ownsRig: ownsRigNamed,
  grantRig,
}
