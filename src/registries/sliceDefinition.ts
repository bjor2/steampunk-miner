/**
 * What a feature slice hands the kernel (docs/standards/feature-slices.md 3.3): its id, which is
 * its folder name, and one `register` that files everything it adds through the registrar. A
 * slice's `register.ts` exports `slice` and does nothing at import.
 */
import type { DebugAction } from '../debug/debugActionRegistry'
import type { SliceEventProjections } from '../logging/registries/eventProjections'
import type { SliceRunEvents } from '../logging/registries/runEvents'
import type { BlastEffect } from '../systems/registries/blastEffects'
import type { SliceCommandRules } from '../systems/registries/commandRules'
import type { ContentKind, ContentKinds } from '../systems/registries/content'
import type {
  DiscoveryAliasTable,
  DiscoveryCodecArgument,
  DiscoveryKind,
  DiscoveryProvider,
} from '../systems/registries/discovery'
import type { GateCheck } from '../systems/registries/gateChecks'
import type { GenerationHook } from '../systems/registries/generationHooks'
import type { OreLookProvider } from '../systems/registries/oreLook'
import type { OreTypeProvider } from '../systems/registries/oreTypes'
import type { SaveSection } from '../systems/registries/saveSections'
import type { AttachUse } from '../systems/registries/vehicleAttach'
import type { LoadoutAcceptance } from '../systems/registries/vehicleLoadout'
import type { HudPanel } from '../ui/registries/hudPanels'

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
  loadoutAcceptance(rule: LoadoutAcceptance): void
  attachUse(use: AttachUse): void
  hudPanel(panel: HudPanel): void
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
