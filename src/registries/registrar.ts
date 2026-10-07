/**
 * Files what slices register into the kernel registries (docs/standards/feature-slices.md 3.1,
 * 3.3): one registrar per slice, which refuses an id without the slice's prefix; slices register
 * in id order; the seal closes every registry. `withRegistrations` is the kernel specs' seam: it
 * runs on a fresh sealed set holding only the given fakes, then puts the loaded set back.
 */
import { DEBUG_ACTION_REGISTRY } from '../debug/debugActionRegistry'
import {
  EVENT_PROJECTION_REGISTRY,
  eventProjectionRegistrationsOf,
} from '../logging/registries/eventProjections'
import { RUN_EVENT_REGISTRATIONS, runEventRegistrationsOf } from '../logging/registries/runEvents'
import { artAssetIdProblems } from '../systems/art/artAssetRules'
import { ART_ASSET_REGISTRY, type ArtAsset } from '../systems/registries/artAssets'
import { BLAST_EFFECT_REGISTRY } from '../systems/registries/blastEffects'
import { BUILDING_ATTACH_USE_REGISTRY } from '../systems/registries/buildingAttach'
import { BOT_PURCHASE_REGISTRY } from '../systems/registries/botPurchases'
import { CLOCK_STEP_REGISTRY } from '../systems/registries/clockSteps'
import {
  COMMAND_RULE_REGISTRY,
  commandRuleRegistrationsOf,
  type CommandRuleRegistration,
} from '../systems/registries/commandRules'
import { CONTENT_REGISTRY, contentRegistrationOf } from '../systems/registries/content'
import {
  DISCOVERY_ALIAS_REGISTRY,
  DISCOVERY_KIND_REGISTRY,
  DISCOVERY_REGISTRY,
  discoveryKindRegistrationOf,
  isKernelDiscoveryKind,
  type DiscoveryKindRegistration,
} from '../systems/registries/discovery'
import { DOCK_SERVICE_REGISTRY } from '../systems/registries/dockServices'
import { GATE_CHECK_REGISTRY } from '../systems/registries/gateChecks'
import { GENERATION_HOOK_REGISTRY } from '../systems/registries/generationHooks'
import { ITEM_DESCRIBER_REGISTRY } from '../systems/registries/itemDescriber'
import { ITEM_DESCRIPTION_ENTRY_REGISTRY } from '../systems/registries/itemDescriptionEntries'
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
import { VEHICLE_STAGING_REGISTRY } from '../systems/registries/vehicleStaging'
import { WORLD_PIECE_REGISTRY } from '../scene/registries/worldPieces'
import { LOADOUT_ACCEPTANCE_REGISTRY } from '../systems/registries/vehicleLoadout'
import { HUD_PANEL_REGISTRY } from '../ui/registries/hudPanels'
import { SCREEN_REGISTRY } from '../ui/registries/screens'
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
    clockStep: (step) => add(CLOCK_STEP_REGISTRY, step),
    dockService: (service) => add(DOCK_SERVICE_REGISTRY, service),
    generationHook: (hook) => add(GENERATION_HOOK_REGISTRY, hook),
    oreLook: (provider) => add(ORE_LOOK_REGISTRY, provider),
    saveSection: (section) => addSaveSection(sliceId, section),
    discovery: (provider) => add(DISCOVERY_REGISTRY, provider),
    discoveryKind: (kind, ...codec) =>
      addDiscoveryKind(sliceId, discoveryKindRegistrationOf(kind, ...codec)),
    discoveryAliases: (table) => add(DISCOVERY_ALIAS_REGISTRY, table),
    itemDescriber: (provider) => add(ITEM_DESCRIBER_REGISTRY, provider),
    itemDescriptionEntries: (entries) =>
      entries.forEach((entry) => add(ITEM_DESCRIPTION_ENTRY_REGISTRY, entry)),
    loadoutAcceptance: (rule) => add(LOADOUT_ACCEPTANCE_REGISTRY, rule),
    attachUse: (use) => add(ATTACH_USE_REGISTRY, use),
    buildingAttachUse: (use) => add(BUILDING_ATTACH_USE_REGISTRY, use),
    hudPanel: (panel) => add(HUD_PANEL_REGISTRY, panel),
    worldPiece: (piece) => add(WORLD_PIECE_REGISTRY, piece),
    vehicleStaging: (provider) => add(VEHICLE_STAGING_REGISTRY, provider),
    artAssets: (assets) => assets.forEach((asset) => addArtAsset(sliceId, asset)),
    botPurchase: (purchase) => add(BOT_PURCHASE_REGISTRY, purchase),
    screen: (panel) => add(SCREEN_REGISTRY, panel),
    debugActions: (actions) =>
      addToRegistry(DEBUG_ACTION_REGISTRY, sliceId, { id: sliceId, actions }),
    commandRules: (rules) =>
      commandRuleRegistrationsOf(rules).forEach((rule) => addCommandRule(sliceId, rule)),
    eventProjections: (projections) =>
      eventProjectionRegistrationsOf(projections).forEach((projection) =>
        add(EVENT_PROJECTION_REGISTRY, projection),
      ),
    runEvents: (events) =>
      runEventRegistrationsOf(events).forEach((event) => add(RUN_EVENT_REGISTRATIONS, event)),
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

/**
 * A kind is named bare (`artefact`, as its keys read `artefact:<id>`), so it is the registry id and
 * registers once across slices; the kernel's own kinds are never registered again.
 */
function addDiscoveryKind(sliceId: string, registration: DiscoveryKindRegistration) {
  if (isKernelDiscoveryKind(registration.id)) refuseKernelDiscoveryKind(sliceId, registration.id)
  addToRegistry(DISCOVERY_KIND_REGISTRY, sliceId, registration)
}

function refuseKernelDiscoveryKind(sliceId: string, kind: string): never {
  throw new RegistrationRefusedError(
    `slice "${sliceId}" registered discovery kind "${kind}", which the kernel already declares`,
  )
}

/** An art id is bare (`prop-dynamite-charge`): the #52 rule replaces the slice prefix (#214). */
function addArtAsset(sliceId: string, asset: ArtAsset) {
  const problems = artAssetIdProblems(asset)
  if (problems.length > 0) refuseArtAsset(sliceId, asset.id, problems)
  addToRegistry(ART_ASSET_REGISTRY, sliceId, asset)
}

function refuseArtAsset(sliceId: string, id: string, problems: readonly string[]): never {
  throw new RegistrationRefusedError(
    `slice "${sliceId}" registered art asset "${id}", which ${problems.join(' and ')}`,
  )
}

/** A slice's debug commands live under `debug.<slice>.`, so they are `debug.*` commands too. */
function addCommandRule(sliceId: string, registration: CommandRuleRegistration) {
  const isSliceDebugCommand = registration.id.startsWith(`debug.${sliceId}.`)
  if (isSliceDebugCommand) addToRegistry(COMMAND_RULE_REGISTRY, sliceId, registration)
  else addPrefixed(COMMAND_RULE_REGISTRY, sliceId, registration)
}

function refuseUnprefixed(registry: Registry<RegistryEntry>, sliceId: string, id: string): never {
  throw new RegistrationRefusedError(
    `slice "${sliceId}" registered "${id}" in "${registry.name}": its ids start with "${sliceId}."`,
  )
}

function sortedById(slices: readonly SliceDefinition[]): SliceDefinition[] {
  return [...slices].sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1))
}
