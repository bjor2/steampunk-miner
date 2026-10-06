/**
 * The shipped music (#49): the four layer loops and the five stingers (the reveal for a platform
 * module, #105; the archetype stinger on arriving at a new kind of planet, #113), one pattern file
 * each in
 * `src/data/music/`. Every file is checked at load and the book refused whole on any problem, so a
 * malformed pattern stops the build's tests instead of playing wrong.
 */
import AMBIENCE from '../../data/music/ambience.json'
import COMBAT from '../../data/music/combat.json'
import PLATFORM from '../../data/music/platform.json'
import ARCHETYPE_STINGER from '../../data/music/stinger-archetype.json'
import ARTEFACT_STINGER from '../../data/music/stinger-artefact.json'
import CORE_STINGER from '../../data/music/stinger-core.json'
import DOCK_STINGER from '../../data/music/stinger-dock.json'
import REVEAL_STINGER from '../../data/music/stinger-reveal.json'
import TENSION from '../../data/music/tension.json'
import { musicPatternProblems } from './musicPattern'
import type { MusicLayers } from './musicLayers'
import { scoreOfPattern, type MusicScore } from './musicScore'
import type { MusicPattern } from './musicPattern'

export type LayerName = keyof MusicLayers
export const STINGER_IDS = ['dock', 'core', 'artefact', 'reveal', 'archetype'] as const
export type StingerId = (typeof STINGER_IDS)[number]

export interface MusicBook {
  layers: Readonly<Record<LayerName, MusicScore>>
  stingers: Readonly<Record<StingerId, MusicScore>>
}

export interface MusicFiles {
  layers: Readonly<Record<LayerName, unknown>>
  stingers: Readonly<Record<StingerId, unknown>>
}

export const SHIPPED_MUSIC_FILES: MusicFiles = {
  layers: { platform: PLATFORM, ambience: AMBIENCE, tension: TENSION, combat: COMBAT },
  stingers: {
    dock: DOCK_STINGER,
    core: CORE_STINGER,
    artefact: ARTEFACT_STINGER,
    reveal: REVEAL_STINGER,
    archetype: ARCHETYPE_STINGER,
  },
}

export const MUSIC_BOOK: MusicBook = loadMusicBook(SHIPPED_MUSIC_FILES)

/** Every problem in every file, each slot's pattern carrying the slot's id. */
export function musicBookProblems(files: MusicFiles): string[] {
  return [...Object.entries(files.layers), ...Object.entries(files.stingers)].flatMap(
    ([slot, file]) => [...musicPatternProblems(file), ...slotProblems(slot, file)],
  )
}

/** The book, or an error listing every problem of every file. */
export function loadMusicBook(files: MusicFiles): MusicBook {
  const problems = musicBookProblems(files)
  if (problems.length > 0) throw new Error(`Refused music:\n${problems.join('\n')}`)
  return {
    layers: scoresOf(files.layers),
    stingers: scoresOf(files.stingers),
  }
}

/** How long a stinger plays, and the layers stay ducked for (#49). */
export function stingerSecondsOf(book: MusicBook, stingerId: StingerId): number {
  return book.stingers[stingerId].loopSeconds
}

function slotProblems(slot: string, file: unknown): string[] {
  const id = (file as { id?: unknown } | null)?.id
  return id === slot ? [] : [`the ${slot} slot holds pattern ${JSON.stringify(id)}`]
}

function scoresOf<Slot extends string>(
  files: Readonly<Record<Slot, unknown>>,
): Record<Slot, MusicScore> {
  const entries = Object.entries(files).map(([slot, file]) => [
    slot,
    scoreOfPattern(file as MusicPattern),
  ])
  return Object.fromEntries(entries) as Record<Slot, MusicScore>
}
