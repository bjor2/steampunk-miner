/**
 * The mining gates' debug actions (feature-slices.md 3.14, #142 "Registers"):
 * `steampunkDebug.features['mining-gates'].describe()` lists the extractors with their planet and
 * price, `.gateTableOf(7, 83921)` reads a planet's gates per band for e2e specs and balance probes,
 * `.dynamiteCellsOf(7, [83921, 31415])` generates the planet on each seed and counts its
 * dynamite-gated ore tiles for `balance:charges` (GD ruling on ticket 237),
 * `.ownsRig('rig.resonance')` reads ownership, and `.grantRig('rig.resonance')` grants one through
 * the kernel's `debug.setVehicleLoadout`, keeping every slotted and owned item, so it replays and
 * logs `debug_command_applied` like a scenario's grant. `.lockMarkerAt(tx, ty)` reads the lock
 * marker the local player sees on a tile, and `.hintChip()` the HUD chip showing (ticket 238).
 * `.drawnMarkerAt(tx, ty)` reads the marker the ground draws there now, from the chunk mesh's gate
 * bits and the uniforms they draw with, and `.gatesNearDock(17, 10)` lists the gated ore cells a
 * docked vehicle sees on that planet and seed, so e2e specs check the ground against the lock
 * marker without driving (ticket 299).
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { vehicleOf } from '../../systems/authority/authorityState'
import { toCanonical } from '../../systems/money'
import type { VehicleLoadout } from '../../systems/vehicle/loadoutState'
import { groundGatePresence } from '../../scene/groundGatePresence'
import { readAuthorityState } from '../../store/authorityLink'
import { planetParamsFor } from '../../systems/world/planetParams'
import { useGameStore } from '../../store/gameStore'
import { useGateHintStore } from './store/gateHintStore'
import { chipShownAt } from './systems/gateChipBoard'
import { drawnMarkerReadOf } from './systems/render/drawnMarkers'
import { lockMarkerOf } from './systems/render/lockMarkers'
import { gatedTilesNearDock } from './systems/gatesNearDock'
import { oreMixFor, oreMixHistogram } from '../planet-mix'
import { dynamiteTilesOf, isDynamiteAct } from './systems/dynamiteCells'
import { GATE_ROWS } from './systems/gateRows'
import { gateTableOf, type CellGate } from './systems/gateTable'
import { availableFromPlanet, ownsRig, rigNamed, rigPriceOf } from './systems/rigs'

const NOT_A_PLANET = 'gateTableOf takes a planet index from 1 and a world seed from 0'
const NOT_PLANET_SEEDS = 'dynamiteCellsOf takes a planet index from 1 and world seeds from 0'
const NOT_A_TILE = 'lockMarkerAt takes whole tile coordinates'
const NOT_A_DRAWN_TILE = 'drawnMarkerAt takes whole tile coordinates'
const NOT_A_DOCK_PLANET = 'gatesNearDock takes a planet index from 1 and a world seed from 0'

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

function dynamiteCellsOf(planetIndex: unknown, worldSeeds: unknown) {
  if (!isWholeAtLeast(planetIndex, 1) || !areWorldSeeds(worldSeeds)) {
    return { ok: false as const, problems: [NOT_PLANET_SEEDS] }
  }
  return {
    ok: true as const,
    planetIndex,
    isDynamiteAct: isDynamiteAct(planetIndex),
    tilesBySeed: worldSeeds.map((seed) =>
      dynamiteTilesOf(
        oreMixHistogram(planetIndex, seed),
        gateTableOf(oreMixFor(planetIndex, seed)),
      ),
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

function lockMarkerAt(tx: unknown, ty: unknown) {
  if (!Number.isSafeInteger(tx) || !Number.isSafeInteger(ty)) {
    return { ok: false as const, problems: [NOT_A_TILE] }
  }
  const tile = { tx: tx as number, ty: ty as number }
  return { ok: true as const, ...lockMarkerOf(readAuthorityState(), localPlayerId(), tile) }
}

function drawnMarkerAt(tx: unknown, ty: unknown) {
  if (!Number.isSafeInteger(tx) || !Number.isSafeInteger(ty)) {
    return { ok: false as const, problems: [NOT_A_DRAWN_TILE] }
  }
  const bits = groundGatePresence.gateBitsAt({ tx: tx as number, ty: ty as number })
  return {
    ok: true as const,
    ...drawnMarkerReadOf(bits, groundGatePresence.viewer),
    tint: [...groundGatePresence.tint],
  }
}

function gatesNearDock(planetIndex: unknown, worldSeed: unknown) {
  if (!isWholeAtLeast(planetIndex, 1) || !isWholeAtLeast(worldSeed, 0)) {
    return { ok: false as const, problems: [NOT_A_DOCK_PLANET] }
  }
  const tiles = gatedTilesNearDock(planetParamsFor(worldSeed, planetIndex))
  return {
    ok: true as const,
    planetIndex,
    worldSeed,
    tiles: tiles.map((tile) => ({ ...tile, gate: plainGateOf(tile.gate) })),
  }
}

function hintChip() {
  const { board, tick } = useGateHintStore.getState()
  return { ok: true as const, chip: chipShownAt(board, tick) }
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

function areWorldSeeds(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((seed) => isWholeAtLeast(seed, 0))
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
  dynamiteCellsOf,
  ownsRig: ownsRigNamed,
  grantRig,
  lockMarkerAt,
  drawnMarkerAt,
  gatesNearDock,
  hintChip,
}
