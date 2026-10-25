/**
 * What makes a track's `covers` unloadable (ticket 892, GD lock 6402021452 on #623, HS input):
 * every covered id is a catalogue item id, named once, and no two tracks cover each other round a
 * loop, so whose look stands for which item never depends on which swap the fold met first. A
 * track covering its own item (a drill type's look standing for its #166 art) is no loop. Which
 * items exist is the rig gear's table, checked where it loads (`tech-tree` `rigCoverProblemsOf`).
 */
import { bareCatalogueIdProblems } from '../../../systems/registries/catalogueIds'
import type { TrackLookRows } from './render/rigLookIndex'

const NO_COVERS: readonly string[] = []

/** Every problem with the tracks' covers; empty when they load. */
export function coverProblemsOf(tracks: readonly TrackLookRows[]): string[] {
  return [...tracks.flatMap(trackCoverProblemsOf), ...coverLoopProblemsOf(tracks)]
}

function trackCoverProblemsOf(rows: TrackLookRows): string[] {
  const covers = coversOf(rows)
  const problems = covers.flatMap((itemId) =>
    bareCatalogueIdProblems(itemId).length > 0 ? [`covers ${itemId}, which is not an item id`] : [],
  )
  if (new Set(covers).size !== covers.length) problems.push('covers an item twice')
  return problems.map((problem) => `${rows.track}: ${problem}`)
}

/** A track on a loop of covers through other tracks, listed once per track on it. */
function coverLoopProblemsOf(tracks: readonly TrackLookRows[]): string[] {
  return tracks
    .filter((rows) => isOnCoverLoop(tracks, rows.track))
    .map((rows) => `${rows.track}: covers loop back to it through another track`)
}

/** Whether a walk along covers from `track`, never through `track` itself, comes back to it. */
function isOnCoverLoop(tracks: readonly TrackLookRows[], track: string): boolean {
  const seen = new Set<string>()
  const next = othersCoveredBy(tracks, track)
  while (next.length > 0) {
    const at = next.pop() as string
    if (at === track) return true
    if (!seen.has(at)) next.push(...othersCoveredBy(tracks, at))
    seen.add(at)
  }
  return false
}

/** The tracks `track`'s rows cover, its own id aside. */
function othersCoveredBy(tracks: readonly TrackLookRows[], track: string): string[] {
  const rows = tracks.find((each) => each.track === track)
  if (rows === undefined) return []
  return coversOf(rows).filter((itemId) => itemId !== track && isTrack(tracks, itemId))
}

function isTrack(tracks: readonly TrackLookRows[], id: string): boolean {
  return tracks.some((rows) => rows.track === id)
}

function coversOf(rows: TrackLookRows): readonly string[] {
  return rows.covers ?? NO_COVERS
}
