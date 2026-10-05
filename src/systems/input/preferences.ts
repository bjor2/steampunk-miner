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
 */
import { CAMERA_MODES, isCameraMode, type CameraMode } from '../render/cameraTurn'
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../../constants/scene'
import { MUSIC_VOLUME_STEPS } from '../../constants/audio'
import { viewShortAxisProblems } from '../render/viewZoom'
import { HINT_TABLE, plaqueIdsOf } from '../hints/hintTable'
import { ACTION_MAP, overrideProblems, type BindingOverrides } from './actionMap'

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
const PREFERENCE_NAMES: readonly PreferenceName[] = ['cameraMode', ...TOGGLE_NAMES, 'musicVolume']
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

/** No file yet gives the defaults with no problem; a broken file gives them with its problems. */
export function readPreferences(text: string | null): PreferencesReading {
  if (text === null) return { prefs: DEFAULT_PREFERENCES, problems: [] }
  const problems = preferenceFileProblems(parseJson(text))
  if (problems.length > 0) return { prefs: DEFAULT_PREFERENCES, problems }
  const { preferencesVersion: _version, ...prefs } = JSON.parse(text) as Partial<Preferences> & {
    preferencesVersion: number
  }
  return { prefs: { ...LATER_FIELDS, ...prefs } as Preferences, problems: [] }
}

export function preferencesText(prefs: Preferences): string {
  return `${JSON.stringify({ preferencesVersion: PREFERENCES_VERSION, ...prefs }, null, 2)}\n`
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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
