/**
 * The blast events the front layer draws next frame: the authority's, heard through
 * `listenForDomainEvents`, and a debug preview's, one frame at a time. A fixed queue in module
 * scope, so hearing and drawing allocate nothing. The feed answers what the events alone do not
 * say (D8, ticket 868): each blast's look seed from the planet's seed and its number, the colour of
 * the ground it broke, whether it is its size's showcase (the ledger of purchases this session),
 * and which collapses a blast rolled are falling now. Presentation only: nothing here reaches the
 * authority, the store or the log.
 */
import { COLLAPSE_DUST_COLOUR } from '../../../constants/scene'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { readAuthorityState } from '../../../store/authorityLink'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { chargeRadiusMm } from '../../../systems/economy/chargeSizes'
import { bandColourOf, shownPaletteOf } from '../../../systems/render/bandPalette'
import { rgbOfHex, type Rgb } from '../../../systems/render/colour'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import {
  collapseFallsAfter,
  EMPTY_FALL_WATCH,
  type CollapseFallWatch,
} from '../systems/render/blastCollapseFall'
import {
  clearBlastEventQueue,
  createBlastEventQueue,
  queueBlastEvents,
  queueFalls,
  type BlastEventQueue,
  type BlastQueueAnswers,
} from '../systems/render/blastEventQueue'
import { QUEUED_BLAST_EVENTS, QUEUED_FALLS } from '../systems/render/blastLookConstants'
import { previewBlastFrames, type PreviewVariant } from '../systems/render/blastPreview'
import {
  EMPTY_SHOWCASE_LEDGER,
  isShowcaseDue,
  ledgerAfterBlast,
  ledgerAfterPurchase,
  type ShowcaseLedger,
} from '../systems/render/blastShowcase'
import { blastVfxSeedOf } from '../systems/render/blastVfxSeed'

const BARE_GROUND = rgbOfHex(COLLAPSE_DUST_COLOUR)
const feed = createBlastEventQueue(QUEUED_BLAST_EVENTS, QUEUED_FALLS)
let previewFrames: DomainEvent[][] = []
let ledger: ShowcaseLedger = EMPTY_SHOWCASE_LEDGER
let fallWatch: CollapseFallWatch = EMPTY_FALL_WATCH

/** A `listenForDomainEvents` listener. */
export function hearBlastEvents(events: readonly DomainEvent[]): void {
  queueBlastEvents(feed, events, answersOn(readAuthorityState()))
  fallWatch = collapseFallsAfter(fallWatch, events)
  queueFalls(feed, fallWatch.falls)
}

/** This frame's events: the authority's since the last frame, and the preview's next frame. */
export function takeBlastFeed(): BlastEventQueue {
  const frame = previewFrames.shift()
  if (frame !== undefined) hearBlastEvents(frame)
  return feed
}

/** Forgets what the layer drew this frame. */
export function clearBlastFeed(): void {
  clearBlastEventQueue(feed)
}

/** Forgets the session's showcases and watched collapses: a spec's fresh start. */
export function resetBlastFeed(): void {
  ledger = EMPTY_SHOWCASE_LEDGER
  fallWatch = EMPTY_FALL_WATCH
  previewFrames = []
  clearBlastEventQueue(feed)
}

export function readShowcaseLedger(): ShowcaseLedger {
  return ledger
}

/** Plays a size's blast at the vehicle's tile, a slice a frame; nothing in the world changes. */
export function previewBlastAtVehicle(size: number, variant: PreviewVariant = 'plain'): void {
  // A tile is a metre (#4), so the vehicle's tile is its drawn position floored.
  const at = { tx: Math.floor(vehiclePresence.x), ty: Math.floor(vehiclePresence.y) }
  previewFrames = previewBlastFrames(at, size, chargeRadiusMm(size), variant)
}

function answersOn(state: AuthorityState): BlastQueueAnswers {
  const params = planetParamsOf(state.planet)
  return {
    seedOf: (blastSeq) => blastVfxSeedOf(params?.planetSeed ?? 0, blastSeq),
    groundColourOf: (tx, ty) => groundColourAt(params, tx, ty),
    isShowcaseOf: takeShowcase,
    noticePurchase: (size) => {
      ledger = ledgerAfterPurchase(ledger, size)
    },
  }
}

/** Whether a blast of `size` is its showcase; the ledger moves on either way. */
function takeShowcase(size: number): boolean {
  const isDue = isShowcaseDue(ledger, size)
  ledger = ledgerAfterBlast(ledger, size)
  return isDue
}

/** The band colour the planet draws the blast's tile in: what its chips and debris wear. */
function groundColourAt(params: PlanetParams | null, tx: number, ty: number): Rgb {
  if (params === null) return BARE_GROUND
  return bandColourOf(shownPaletteOf(params), bandOfTile(params, tx, ty))
}
