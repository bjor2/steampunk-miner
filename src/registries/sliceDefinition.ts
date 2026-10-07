/**
 * What a feature slice hands the kernel (docs/standards/feature-slices.md 3.3): its id, which is
 * its folder name, and one `register` that files everything it adds through the registrar. A
 * slice's `register.ts` exports `slice` and does nothing at import.
 */
import type { DebugAction } from '../debug/debugActionRegistry'
import type { SliceEventProjections } from '../logging/registries/eventProjections'
import type { SliceRunEvents } from '../logging/registries/runEvents'
import type { ArtAsset } from '../systems/registries/artAssets'
import type { BlastEffect } from '../systems/registries/blastEffects'
import type { BuildingAttachUse } from '../systems/registries/buildingAttach'
import type { BotPurchase } from '../systems/registries/botPurchases'
import type { ClockStep } from '../systems/registries/clockSteps'
import type { SliceCommandRules } from '../systems/registries/commandRules'
import type { ContentKind, ContentKinds } from '../systems/registries/content'
import type {
  DiscoveryAliasTable,
  DiscoveryCodecArgument,
  DiscoveryKind,
  DiscoveryProvider,
} from '../systems/registries/discovery'
import type { DockService } from '../systems/registries/dockServices'
import type { GateCheck } from '../systems/registries/gateChecks'
import type { GenerationHook } from '../systems/registries/generationHooks'
import type { ItemDescriberProvider } from '../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../systems/registries/itemDescriptionEntries'
import type { OreLookProvider } from '../systems/registries/oreLook'
import type { OreTypeProvider } from '../systems/registries/oreTypes'
import type { SaveSection } from '../systems/registries/saveSections'
import type { AttachUse } from '../systems/registries/vehicleAttach'
import type { VehicleStagingProvider } from '../systems/registries/vehicleStaging'
import type { WorldPiece } from '../scene/registries/worldPieces'
import type { LoadoutAcceptance } from '../systems/registries/vehicleLoadout'
import type { HudPanel } from '../ui/registries/hudPanels'
import type { ScreenPanel } from '../ui/registries/screens'

export { FeaturesNotLoadedError } from '../systems/registries/seal'

export interface SliceDefinition {
  /** Equals the folder name under src/features; the loader checks it. */
  id: string
  register(r: SliceRegistrar): void
}

/** Every id a slice registers starts with `<slice>.`; the registrar throws otherwise. */
export interface SliceRegistrar {
  content<K extends ContentKind>(kind: K, entries: readonly ContentKinds[K][]): void
  /** One provider across all slices. */
  oreTypes(provider: OreTypeProvider): void
  gateCheck(check: GateCheck): void
  blastEffect(effect: BlastEffect): void
  /** Runs on the authority clock after the kernel's steps, in id order (#217). */
  clockStep(step: ClockStep): void
  /** A free refill at the end of every paid recharge; the bill never changes (#217). */
  dockService(service: DockService): void
  generationHook(hook: GenerationHook): void
  /** One provider across all slices. */
  oreLook(provider: OreLookProvider): void
  /** Its id is `<slice>` or `<slice>.<name>`. */
  saveSection<T>(section: SaveSection<T>): void
  /** One provider across all slices. */
  discovery(provider: DiscoveryProvider): void
  /** A kind the slice declared in `DiscoveryKinds`; `ids` is the default codec. Bare, unprefixed. */
  discoveryKind<K extends DiscoveryKind>(kind: K, ...codec: DiscoveryCodecArgument<K>): void
  /** Keys the codex canonicalises through, on load and on every write. */
  discoveryAliases(table: DiscoveryAliasTable): void
  /** One provider across all slices: the `descriptions` slice, the item card's one voice. */
  itemDescriber(provider: ItemDescriberProvider): void
  /** Card lines for the slice's own items; two entries matching one ref are refused at the seal. */
  itemDescriptionEntries(entries: readonly ItemDescriptionEntry[]): void
  loadoutAcceptance(rule: LoadoutAcceptance): void
  attachUse(use: AttachUse): void
  /** A use of a shop building's attach point (#170 `building-attach`): render-only. */
  buildingAttachUse(use: BuildingAttachUse): void
  hudPanel(panel: HudPanel): void
  /** A piece of the world scene, drawn in its layer (#175). */
  worldPiece(piece: WorldPiece): void
  /** One provider across all slices: how a dock building stages the local vehicle (#170). */
  vehicleStaging(provider: VehicleStagingProvider): void
  /**
   * Blender assets the slice ships, joining `blenderAssetIds()`. Bare art ids, not prefixed:
   * kebab-case, starting with `<category>-`, never a kernel id or another slice's (#214).
   */
  artAssets(assets: readonly ArtAsset[]): void
  /** A slice command the pacing bot may buy after the kernel's own purchases. */
  botPurchase(purchase: BotPurchase): void
  /** A full screen the kernel shell draws while the store holds it open. */
  screen(panel: ScreenPanel): void
  /** Filed under the slice id: `steampunkDebug.features['<slice>']`. */
  debugActions(actions: Readonly<Record<string, DebugAction>>): void
  /**
   * Rules for the commands the slice adds to `CommandPayloads`, keyed by type: `<slice>.<name>`,
   * or `debug.<slice>.<name>` for a debug command, which replays and logs `debug_command_applied`.
   */
  commandRules(rules: SliceCommandRules): void
  /** Run-log projections of the domain events the slice adds, keyed by `<slice>.<Event>` type. */
  eventProjections(projections: SliceEventProjections): void
  /** The run events those projections log, keyed by `<slice>.<snake_case>` name. */
  runEvents(events: SliceRunEvents): void
}
