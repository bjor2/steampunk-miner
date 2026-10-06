/**
 * The local preferences file (#33 sections 1 and 3, #16): presentation settings and the player's
 * rebinding, never in the save, the state digest or the replay. Read through the shell, refused
 * whole on any problem (every problem listed, the defaults in force), like every other file the
 * game reads.
 *
 * `cameraMode` is the fixed-camera accessibility toggle (#13), `shake` and `flashes` the
 * screen-shake and flash switches, `hintsEnabled` the "Show hints" setting the hints (#27) read,
 * `bindings` the sparse override of the action map, `seenHints` the hints and transmissions already
 * shown (#16), so none repeats after a reload, `viewShortAxisMetres` the player's zoom (#39),
 * `musicVolume` and `musicMuted` the music settings (#49). A file written before the seen-set, the
 * zoom or the music settings existed reads as nothing seen, the 12 m default and full music.
 *
 * The file notes the `inputMapVersion` its bindings were made for. Bindings from an older map
 * (none noted is version 1) are discarded for the current defaults, never migrated (#40, the Game
 * Director's ruling on #54); the other settings stay, and the reading says why the keys reset.
 */
import { CAMERA_MODES, isCameraMode, type CameraMode } from '../render/cameraTurn'
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../../constants/scene'
import { MUSIC_VOLUME_STEPS } from '../../constants/audio'
import { viewShortAxisProblems } from '../render/viewZoom'
import { HINT_TABLE, plaqueIdsOf } from '../hints/hintTable'
import {
  ACTION_MAP,
  INPUT_MAP_VERSION,
  isActionId,
  overrideProblems,
  type BindingOverrides,
} from './actionMap'

export const PREFERENCES_VERSION = 1

export interface Preferences {
  cameraMode: CameraMode
  shake: boolean
  flashes: boolean
  hintsEnabled: boolean
  bindings: BindingOverrides
  seenHints: readonly string[]
  /** Metres across the screen's shorter axis, 8 to 20 (#39); stepped by the zoom actions. */
  viewShortAxisMetres: number
  /** The music's level, 0 to 1 (#49); the sound effects keep theirs. */
  musicVolume: number
  musicMuted: boolean
}

/** The settings a player toggles one by one (`ui.setPref`); bindings change through rebinding. */
export type PreferenceName =
  'cameraMode' | 'shake' | 'flashes' | 'hintsEnabled' | 'musicMuted' | 'musicVolume'

export interface PreferencesReading {
  prefs: Preferences
  problems: string[]
  /** Why rebinding from an older input map was dropped for the defaults; empty when none was. */
  bindingsReset: string[]
}

export const DEFAULT_PREFERENCES: Preferences = {
  cameraMode: 'rotating',
  shake: true,
  flashes: true,
  hintsEnabled: true,
  bindings: {},
  seenHints: [],
  viewShortAxisMetres: VIEW_SHORT_AXIS_DEFAULT_M,
  musicVolume: 1,
  musicMuted: false,
}

const TOGGLE_NAMES = ['shake', 'flashes', 'hintsEnabled', 'musicMuted'] as const
/** Every setting the overlay lists, in its order; each has an icon (#158). */
export const PREFERENCE_NAMES: readonly PreferenceName[] = [
  'cameraMode',
  ...TOGGLE_NAMES,
  'musicVolume',
]
/** The settings every preferences file has held; the music ones came later (#49). */
const FIRST_PREFERENCE_NAMES: readonly PreferenceName[] = [
  'cameraMode',
  'shake',
  'flashes',
  'hintsEnabled',
]
const LATER_PREFERENCE_NAMES: readonly PreferenceName[] = ['musicMuted', 'musicVolume']
const FILE_FIELDS = [
  'preferencesVersion',
  'inputMapVersion',
  ...PREFERENCE_NAMES,
  'bindings',
  'seenHints',
  'viewShortAxisMetres',
]

/** Fields a file from an earlier build may lack; they read as their defaults. */
const LATER_FIELDS: Pick<
  Preferences,
  'seenHints' | 'viewShortAxisMetres' | 'musicVolume' | 'musicMuted'
> = {
  seenHints: [],
  viewShortAxisMetres: VIEW_SHORT_AXIS_DEFAULT_M,
  musicVolume: DEFAULT_PREFERENCES.musicVolume,
  musicMuted: DEFAULT_PREFERENCES.musicMuted,
}

/** Only the input map before #40 existed when files did not note their version. */
const UNNOTED_INPUT_MAP_VERSION = 1

/** No file yet gives the defaults with no problem; a broken file gives them with its problems. */
export function readPreferences(text: string | null): PreferencesReading {
  if (text === null) return { prefs: DEFAULT_PREFERENCES, problems: [], bindingsReset: [] }
  const file = parseJson(text)
  return { ...readCurrentFile(withCurrentBindings(file)), bindingsReset: bindingsResetOf(file) }
}

export function preferencesText(prefs: Preferences): string {
  const file = { preferencesVersion: PREFERENCES_VERSION, inputMapVersion: INPUT_MAP_VERSION }
  return `${JSON.stringify({ ...file, ...prefs }, null, 2)}\n`
}

/** Why `value` cannot be the setting `name`; empty when it can. */
export function preferenceProblems(name: unknown, value: unknown): string[] {
  if (!PREFERENCE_NAMES.includes(name as PreferenceName)) {
    return [`${JSON.stringify(name)} is not a setting (${PREFERENCE_NAMES.join(', ')})`]
  }
  if (name === 'musicVolume') return musicVolumeProblems(value)
  if (name === 'cameraMode') {
    return isCameraMode(value)
      ? []
      : [`camera mode must be one of ${CAMERA_MODES.join(', ')}, got ${JSON.stringify(value)}`]
  }
  return typeof value === 'boolean'
    ? []
    : [`${name} must be true or false, got ${JSON.stringify(value)}`]
}

/** The settings overlay's "Change" on the music volume: a quarter down, from silence back to full. */
export function nextMusicVolume(musicVolume: number): number {
  return musicVolume <= 0 ? 1 : Math.max(0, musicVolume - 1 / MUSIC_VOLUME_STEPS)
}

export function withPreference(
  prefs: Preferences,
  name: PreferenceName,
  value: unknown,
): Preferences {
  return { ...prefs, [name]: value }
}

function readCurrentFile(file: unknown): Omit<PreferencesReading, 'bindingsReset'> {
  const problems = preferenceFileProblems(file)
  if (problems.length > 0) return { prefs: DEFAULT_PREFERENCES, problems }
  const {
    preferencesVersion: _version,
    inputMapVersion: _inputMap,
    ...prefs
  } = file as Partial<Preferences> & { preferencesVersion: number; inputMapVersion: number }
  return { prefs: { ...LATER_FIELDS, ...prefs } as Preferences, problems: [] }
}

/** A file from an older input map, with its bindings dropped for the current defaults. */
function withCurrentBindings(file: unknown): unknown {
  if (!isRecord(file) || !isFromOlderInputMap(file)) return file
  return { ...file, inputMapVersion: INPUT_MAP_VERSION, bindings: {} }
}

/** The notice for rebinding made on an older input map, naming the ids it no longer has. */
function bindingsResetOf(file: unknown): string[] {
  if (!isRecord(file) || !isFromOlderInputMap(file) || !hasRebinding(file.bindings)) return []
  const version = JSON.stringify(file.inputMapVersion ?? UNNOTED_INPUT_MAP_VERSION)
  const staleIds = Object.keys(file.bindings as object).filter((id) => !isActionId(id))
  return [
    `key bindings made for input map version ${version} were reset to the version ${INPUT_MAP_VERSION} defaults`,
    ...staleIds.map((id) => `${JSON.stringify(id)} is no longer an action`),
  ]
}

function isFromOlderInputMap(file: Record<string, unknown>): boolean {
  return (file.inputMapVersion ?? UNNOTED_INPUT_MAP_VERSION) !== INPUT_MAP_VERSION
}

/** Anything but an absent or empty override map, which leaves nothing to discard. */
function hasRebinding(bindings: unknown): boolean {
  return bindings !== undefined && !(isRecord(bindings) && Object.keys(bindings).length === 0)
}

function preferenceFileProblems(file: unknown): string[] {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) {
    return ['the preferences file must hold a JSON object']
  }
  const fields = file as Record<string, unknown>
  return [
    ...(fields.preferencesVersion === PREFERENCES_VERSION
      ? []
      : [`preferencesVersion must be ${PREFERENCES_VERSION}`]),
    ...Object.keys(fields)
      .filter((field) => !FILE_FIELDS.includes(field))
      .map((field) => `unknown preferences field ${JSON.stringify(field)}`),
    ...FIRST_PREFERENCE_NAMES.flatMap((name) => preferenceProblems(name, fields[name])),
    ...LATER_PREFERENCE_NAMES.filter((name) => fields[name] !== undefined).flatMap((name) =>
      preferenceProblems(name, fields[name]),
    ),
    ...overrideProblems(ACTION_MAP, fields.bindings),
    ...seenHintsProblems(fields.seenHints),
    ...(fields.viewShortAxisMetres === undefined
      ? []
      : viewShortAxisProblems(fields.viewShortAxisMetres)),
  ]
}

/** Absent is an empty seen-set; present, it lists known hint and transmission ids, once each. */
function seenHintsProblems(seenHints: unknown): string[] {
  if (seenHints === undefined) return []
  const knownIds = plaqueIdsOf(HINT_TABLE)
  if (!Array.isArray(seenHints)) return ['seenHints must be a list of hint ids']
  return seenHints
    .filter((id, index) => !knownIds.includes(id) || seenHints.indexOf(id) !== index)
    .map((id) => `seenHints: ${JSON.stringify(id)} is not a hint id, or is listed twice`)
}

function musicVolumeProblems(value: unknown): string[] {
  return typeof value === 'number' && value >= 0 && value <= 1
    ? []
    : [`musicVolume must be a number from 0 to 1, got ${JSON.stringify(value)}`]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
