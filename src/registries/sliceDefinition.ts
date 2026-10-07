/**
 * What a feature slice hands the kernel (docs/standards/feature-slices.md 3.3): its id, which is
 * its folder name, and one `register` that files everything it adds through the registrar. A
 * slice's `register.ts` exports `slice` and does nothing at import.
 */
import type { DebugAction } from '../debug/debugActionRegistry'
import type { SliceEventProjections } from '../logging/registries/eventProjections'
import type { ReportRowSource } from '../logging/registries/reportRows'
import type { SliceRunEvents } from '../logging/registries/runEvents'
import type { ArtAsset } from '../systems/registries/artAssets'
import type { AuthorityReaction } from '../systems/registries/authorityReactions'
import type { BlastEffect } from '../systems/registries/blastEffects'
import type { BuildingAttachUse } from '../systems/registries/buildingAttach'
import type { BotPurchase } from '../systems/registries/botPurchases'
import type { ChargeBlastCueProvider } from '../systems/registries/chargeBlastCue'
import type { ClockStep } from '../systems/registries/clockSteps'
import type { SliceCommandRules } from '../systems/registries/commandRules'
import type { ContentKind, ContentKinds } from '../systems/registries/content'
import type {
  DiscoveryAliasTable,
  DiscoveryCodecArgument,
  DiscoveryKind,
  DiscoveryProvider,
} from '../systems/registries/discovery'
import type { DockFacility } from '../systems/registries/dockFacilities'
import type { DockService } from '../systems/registries/dockServices'
import type { DrillGearSource } from '../systems/registries/drillGear'
import type { InputReactionEntry } from '../systems/registries/inputReactions'
import type { EnemyDetectionModifier } from '../systems/registries/enemyDetectionModifiers'
import type { GateCheck } from '../systems/registries/gateChecks'
import type { GenerationHook } from '../systems/registries/generationHooks'
import type { HeatPause } from '../systems/registries/heatPauses'
import type { SlotHoldCueSource } from '../systems/registries/slotHoldCues'
import type { HullDamageIntercept } from '../systems/registries/hullDamageIntercepts'
import type { ItemDescriberProvider } from '../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../systems/registries/itemDescriptionEntries'
import type { OreLookProvider } from '../systems/registries/oreLook'
import type { OreDrillClassProvider } from '../systems/registries/oreDrillClasses'
import type { OreSignatureTag, OreTypeProvider } from '../systems/registries/oreTypes'
import type { PartMotionRequestSource } from '../systems/registries/partMotionRequests'
import type { SaveSection } from '../systems/registries/saveSections'
import type { SoundCue } from '../systems/registries/soundCues'
import type { AttachUse } from '../systems/registries/vehicleAttach'
import type { VehicleMotionEffectSource } from '../systems/registries/vehicleMotionEffects'
import type { VehicleStagingProvider } from '../systems/registries/vehicleStaging'
import type { SceneLayer } from '../scene/registries/sceneLayers'
import type { VehiclePiece } from '../scene/registries/vehiclePieces'
import type { WorldPiece } from '../scene/registries/worldPieces'
import type { LoadoutAcceptance } from '../systems/registries/vehicleLoadout'
import type { BayPanel } from '../ui/registries/bayPanels'
import type { SliceBayScreen } from '../ui/registries/bayScreens'
import type { HudPanel } from '../ui/registries/hudPanels'
import type { MoneyCounterProvider } from '../ui/registries/moneyCounter'
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
  /** Folded over every ore the provider answers: a yes makes it a signature (#232). */
  oreSignature(tag: OreSignatureTag): void
  /** One provider across all slices: the drill class of an ore cell (#236, dense or signature). */
  oreDrillClass(provider: OreDrillClassProvider): void
  gateCheck(check: GateCheck): void
  blastEffect(effect: BlastEffect): void
  /** Runs on the authority clock after the kernel's steps, in id order (#217). */
  clockStep(step: ClockStep): void
  /** A free refill at the end of every paid recharge; the bill never changes (#217). */
  dockService(service: DockService): void
  /**
   * Scales an enemy's hit or a collapse's crush on the vehicle; all of them multiplied never take
   * it below half (ticket 233).
   */
  hullDamageIntercept(intercept: HullDamageIntercept): void
  /** Shrinks how far a hunting enemy notices the vehicle, never below half (ticket 233). */
  enemyDetectionModifier(modifier: EnemyDetectionModifier): void
  /** Vents the heat gauge and pauses heat gain for windows the slice keeps (ticket 233). */
  heatPause(pause: HeatPause): void
  /**
   * Boosts, bursts, reels, hover or cling on a vehicle, read from the slice's section each fixed
   * step; boosts sum to at most +2000 bp over the engine track (ticket 233).
   */
  vehicleMotionEffect(source: VehicleMotionEffectSource): void
  /** A dock building that opens its `facility` schedule row from that row's planet on (#221). */
  dockFacility(facility: DockFacility): void
  /**
   * Cells the player's drill cuts past the bit and beside the bore, listed only after `canMine`; a
   * side cell costs at least the drill's own energy for it (ticket 234).
   */
  drillGear(source: DrillGearSource): void
  /** Answers a pressed action the kernel's routing table leaves open, such as `use_slot_1`. */
  inputReaction(reaction: InputReactionEntry): void
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
  /** A panel in the bay header, left of the money, or in the layer above the bay screen. */
  bayPanel(panel: BayPanel): void
  /** A bay's whole screen, one per bay, shown once its schedule row is open (#180). */
  bayScreen(screen: SliceBayScreen): void
  /** One provider across all slices: the money the bay header's counter shows (ticket 220). */
  moneyCounter(provider: MoneyCounterProvider): void
  /** A piece of the world scene, drawn in its layer (#175). */
  worldPiece(piece: WorldPiece): void
  /** A layer of the world scene with the most it draws, after the planted charges (#213). */
  sceneLayer(layer: SceneLayer): void
  /** A piece drawn in the local vehicle's body frame, at the base vehicle's attach points (#235). */
  vehiclePiece(piece: VehiclePiece): void
  /** One provider across all slices: how a dock building stages the local vehicle (#170). */
  vehicleStaging(provider: VehicleStagingProvider): void
  /** Poses and part swaps on the drawn car, at vehicle-attach points, asked each tick (#180). */
  partMotionRequests(source: PartMotionRequestSource): void
  /**
   * Blender assets the slice ships, joining `blenderAssetIds()`. Bare art ids, not prefixed:
   * kebab-case, starting with `<category>-`, never a kernel id or another slice's (#214).
   */
  artAssets(assets: readonly ArtAsset[]): void
  /** A slice command the pacing bot may buy after the kernel's own purchases. */
  botPurchase(purchase: BotPurchase): void
  /** A full screen the kernel shell draws while the store holds it open. */
  screen(panel: ScreenPanel): void
  /** A synthesised sound with its voice budget, played on `requestSoundCue` (#180). */
  soundCue(cue: SoundCue): void
  /** One provider across all slices: a charge's shake, flash and thump delay (#213). */
  chargeBlastCue(provider: ChargeBlastCueProvider): void
  /** Names the slice's events that end a slot hold: cancelled clanks, finished chimes (253). */
  slotHoldCue(source: SlotHoldCueSource): void
  /** Filed under the slice id: `steampunkDebug.features['<slice>']`. */
  debugActions(actions: Readonly<Record<string, DebugAction>>): void
  /**
   * Rules for the commands the slice adds to `CommandPayloads`, keyed by type: `<slice>.<name>`,
   * or `debug.<slice>.<name>` for a debug command, which replays and logs `debug_command_applied`.
   */
  commandRules(rules: SliceCommandRules): void
  /**
   * Folds the domain events of each accepted command and settled tick into the slice's section,
   * in id order, its events stamped for the player it heard (#219).
   */
  authorityReaction(reaction: AuthorityReaction): void
  /** Run-log projections of the domain events the slice adds, keyed by `<slice>.<Event>` type. */
  eventProjections(projections: SliceEventProjections): void
  /** The run events those projections log, keyed by `<slice>.<snake_case>` name. */
  runEvents(events: SliceRunEvents): void
  /**
   * Rows the balance and session reports print per planet, read off a run's events (#223); never
   * a feature-unlock id.
   */
  reportRows(source: ReportRowSource): void
}
