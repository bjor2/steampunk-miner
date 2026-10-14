/**
 * The player's profile (#401 Horizontal Scaler 4, ticket 407): what a player carries from world to
 * world, which is their settings and their cosmetic choices and nothing else. Unlocks, owned items,
 * artefact picks, firsts, the planet and money belong to the world, and in co-op to the host's save
 * of it (`worldSaveOwnership.ts`), so a profile loaded into another world can bring none of them.
 *
 * #3 first put the wallet and upgrades in the profile; #401 moved them into the host world, so the
 * save's per-player section is the world's and never this profile.
 *
 * The settings are the preferences file's (#33): read through its reader, so a profile holds the
 * same settings with the same checks. No cosmetic ships yet; `cosmetics` maps a cosmetic slot to
 * the chosen cosmetic's id, so the first one adds data, not a new profile version.
 *
 * Reading refuses whole: a field the profile does not have, settings the preferences reader
 * refuses, or another profile version is a listed problem, and the defaults stay in force.
 */
import { isJsonObject } from '../authority/payloadFields'
import {
  DEFAULT_PREFERENCES,
  preferencesText,
  readPreferences,
  type Preferences,
} from '../input/preferences'

export const PROFILE_VERSION = 1

/** Cosmetic slot id to the chosen cosmetic's id. */
export type CosmeticChoices = Readonly<Record<string, string>>

export const NO_COSMETICS: CosmeticChoices = {}

export interface PlayerProfile {
  settings: Preferences
  cosmetics: CosmeticChoices
}

export interface PlayerProfileReading {
  profile: PlayerProfile
  problems: string[]
}

export const DEFAULT_PLAYER_PROFILE: PlayerProfile = {
  settings: DEFAULT_PREFERENCES,
  cosmetics: NO_COSMETICS,
}

const PROFILE_FIELDS = ['profileVersion', 'settings', 'cosmetics']

/** Takes no world: nothing of the session the player is in can reach their profile. */
export function playerProfileOf(
  settings: Preferences,
  cosmetics: CosmeticChoices = NO_COSMETICS,
): PlayerProfile {
  return { settings, cosmetics }
}

export function playerProfileText(profile: PlayerProfile): string {
  const settings = JSON.parse(preferencesText(profile.settings)) as unknown
  const file = { profileVersion: PROFILE_VERSION, settings, cosmetics: profile.cosmetics }
  return `${JSON.stringify(file, null, 2)}\n`
}

export function readPlayerProfile(text: string): PlayerProfileReading {
  const file = parsedProfileFile(text)
  const problems = profileFileProblems(file)
  if (problems.length > 0) return { profile: DEFAULT_PLAYER_PROFILE, problems }
  return { profile: profileOfFile(file as Record<string, unknown>), problems: [] }
}

function profileOfFile(file: Record<string, unknown>): PlayerProfile {
  const settings = readPreferences(JSON.stringify(file.settings)).prefs
  return playerProfileOf(settings, file.cosmetics as CosmeticChoices)
}

function profileFileProblems(file: unknown): string[] {
  if (!isJsonObject(file)) return ['the profile must hold a JSON object']
  return [
    ...versionProblems(file.profileVersion),
    ...worldFieldProblems(file),
    ...settingsProblems(file.settings),
    ...cosmeticsProblems(file.cosmetics),
  ]
}

function versionProblems(version: unknown): string[] {
  if (version === PROFILE_VERSION) return []
  return [
    `profile.profileVersion is ${JSON.stringify(version)}, this build reads ${PROFILE_VERSION}`,
  ]
}

/** Any other field is refused, so no unlock, item or wallet can ride in on a profile. */
function worldFieldProblems(file: Record<string, unknown>): string[] {
  return Object.keys(file)
    .filter((field) => !PROFILE_FIELDS.includes(field))
    .map(
      (field) =>
        `profile.${field} is not the profile's: it carries only settings and cosmetics, the world's progress stays in the host's save`,
    )
}

function settingsProblems(settings: unknown): string[] {
  if (!isJsonObject(settings)) return ['profile.settings must be an object']
  const reading = readPreferences(JSON.stringify(settings))
  return reading.problems.map((problem) => `profile.settings: ${problem}`)
}

function cosmeticsProblems(cosmetics: unknown): string[] {
  if (!isJsonObject(cosmetics)) return ['profile.cosmetics must be an object']
  return Object.entries(cosmetics)
    .filter(([, cosmetic]) => typeof cosmetic !== 'string')
    .map(([slot]) => `profile.cosmetics.${slot} must be a cosmetic id`)
}

function parsedProfileFile(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
