/**
 * Files what slices register into the kernel registries (docs/standards/feature-slices.md 3.1,
 * 3.3): one registrar per slice, which refuses an id without the slice's prefix; slices register
 * in id order; the seal closes every registry. `withRegistrations` is the kernel specs' seam: it
 * runs on a fresh sealed set holding only the given fakes, then puts the loaded set back.
 */
import { DEBUG_ACTION_REGISTRY } from '../debug/debugActionRegistry'
import { BLAST_EFFECT_REGISTRY } from '../systems/registries/blastEffects'
import { CONTENT_REGISTRY, contentRegistrationOf } from '../systems/registries/content'
import { DISCOVERY_REGISTRY } from '../systems/registries/discovery'
import { GATE_CHECK_REGISTRY } from '../systems/registries/gateChecks'
import { GENERATION_HOOK_REGISTRY } from '../systems/registries/generationHooks'
import { ORE_LOOK_REGISTRY } from '../systems/registries/oreLook'
import { ORE_TYPE_REGISTRY } from '../systems/registries/oreTypes'
import { SAVE_SECTION_REGISTRY, type SaveSection } from '../systems/registries/saveSections'
import {
  addToRegistry,
  RegistrationRefusedError,
  sealRegistrySet,
  withFreshRegistrySet,
  type Registry,
  type RegistryEntry,
} from '../systems/registries/seal'
import { ATTACH_USE_REGISTRY } from '../systems/registries/vehicleAttach'
import { LOADOUT_ACCEPTANCE_REGISTRY } from '../systems/registries/vehicleLoadout'
import { HUD_PANEL_REGISTRY } from '../ui/registries/hudPanels'
import type { SliceDefinition, SliceRegistrar } from './sliceDefinition'

export function registrarFor(sliceId: string): SliceRegistrar {
  const add = <T extends RegistryEntry>(registry: Registry<T>, entry: T) =>
    addPrefixed(registry, sliceId, entry)
  return {
    content: (kind, entries) =>
      entries.forEach((entry) => add(CONTENT_REGISTRY, contentRegistrationOf(kind, entry))),
    oreTypes: (provider) => add(ORE_TYPE_REGISTRY, provider),
    gateCheck: (check) => add(GATE_CHECK_REGISTRY, check),
    blastEffect: (effect) => add(BLAST_EFFECT_REGISTRY, effect),
    generationHook: (hook) => add(GENERATION_HOOK_REGISTRY, hook),
    oreLook: (provider) => add(ORE_LOOK_REGISTRY, provider),
    saveSection: (section) => addSaveSection(sliceId, section),
    discovery: (provider) => add(DISCOVERY_REGISTRY, provider),
    loadoutAcceptance: (rule) => add(LOADOUT_ACCEPTANCE_REGISTRY, rule),
    attachUse: (use) => add(ATTACH_USE_REGISTRY, use),
    hudPanel: (panel) => add(HUD_PANEL_REGISTRY, panel),
    debugActions: (actions) =>
      addToRegistry(DEBUG_ACTION_REGISTRY, sliceId, { id: sliceId, actions }),
  }
}

/** Each slice registers in id order, so registration order never depends on discovery order. */
export function registerSlices(slices: readonly SliceDefinition[]): void {
  sortedById(slices).forEach((slice) => slice.register(registrarFor(slice.id)))
}

export function sealRegistries(): void {
  sealRegistrySet()
}

/** Registers the slices, seals, and returns their ids in registration order. */
export function loadSlices(slices: readonly SliceDefinition[]): readonly string[] {
  registerSlices(slices)
  sealRegistries()
  return sortedById(slices).map((slice) => slice.id)
}

/**
 * Runs `run` with only `slices` registered, on a fresh sealed set, then restores the loaded one.
 * Synchronous only; kernel specs register fakes here and never import a slice.
 */
export function withRegistrations<T>(slices: readonly SliceDefinition[], run: () => T): T {
  return withFreshRegistrySet(() => registerSlices(slices), run)
}

function addPrefixed<T extends RegistryEntry>(registry: Registry<T>, sliceId: string, entry: T) {
  if (!entry.id.startsWith(`${sliceId}.`)) refuseUnprefixed(registry, sliceId, entry.id)
  addToRegistry(registry, sliceId, entry)
}

/** A section may also be named by the bare slice id: `codex` beside `codex.pages`. */
function addSaveSection(sliceId: string, section: SaveSection<unknown>) {
  if (section.id === sliceId) addToRegistry(SAVE_SECTION_REGISTRY, sliceId, section)
  else addPrefixed(SAVE_SECTION_REGISTRY, sliceId, section)
}

function refuseUnprefixed(registry: Registry<RegistryEntry>, sliceId: string, id: string): never {
  throw new RegistrationRefusedError(
    `slice "${sliceId}" registered "${id}" in "${registry.name}": its ids start with "${sliceId}."`,
  )
}

function sortedById(slices: readonly SliceDefinition[]): SliceDefinition[] {
  return [...slices].sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1))
}
