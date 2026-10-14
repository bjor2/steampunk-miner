import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import type { BotSession } from '../../systems/bot/botSession'
import { contentOf } from '../../systems/registries/content'
import { describeItem } from '../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../systems/registries/itemSnapshotView'
import { LOCKED_SCHEDULE } from '../../systems/unlocks/unlockSchedule'
import { oreFamilies } from '../ores'
import { forkBranchesToWalk, type WalkedForkBranch } from './forkBranchWalk'
import { PLAYER, sessionOnPlanet } from './treeTestSession'
import { FORK_TIER } from './systems/forkNode'
import { lastMarkOf } from './systems/markLadder'
import { forkPieceOf } from './systems/render/forkPieces'
import { registeredTechTree } from './systems/techTree'
import { nodeCardModelOf } from './systems/treeScreenModel'

// The GD lock on #255 (build 6, ticket 271): walk each of the twelve branches at P16, the planet
// they open on, and read what the player sees and what choosing one does: no vision row and no
// ore family 3-12 (they come with their acts) on the card or in the effect. A registered branch
// is chosen on P16 and read off its events, its card, its item's card at every Mark, its item's
// content rows and its #235 piece. A branch its lane holds back (the Hauler until #385) cannot be
// chosen or carded, so the node its lane authored is read instead.

const VISION_ROWS = LOCKED_SCHEDULE.rows.filter((row) => row.status === 'vision')

/** Ore families 3-12, by id and display name. */
const LATER_FAMILIES = oreFamilies().slice(2)

interface WalkedText {
  id: string
  text: string
}

/** A player on P16 with every node before the fork researched (the aetheric pair needs its entry). */
function chooseOnFork(walked: WalkedForkBranch): { session: BotSession; events: DomainEvent[] } {
  const session = sessionOnPlanet(FORK_TIER)
  session.submit({
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex: FORK_TIER - 1 },
  })
  const events = [
    ...session.submit({
      type: 'tech-tree.choose_fork',
      payload: { lane: walked.lane, branch: walked.branch },
    }),
  ]
  return { session, events }
}

/** Mark 1 to the last Mark of the branch's ladder; Mark 1 alone for a branch with none. */
function marksOf(walked: WalkedForkBranch): number[] {
  const lastMark = walked.authored.marks === undefined ? 1 : lastMarkOf(walked.authored.marks)
  return Array.from({ length: lastMark }, (_, at) => at + 1)
}

function itemCardsOf(session: BotSession, walked: WalkedForkBranch): unknown[] {
  const view = itemSnapshotViewOf(session.state(), PLAYER)
  const id = walked.node.unlocks.itemId
  return marksOf(walked).map((level) =>
    describeItem(
      { kind: 'vehicle-item', id },
      { playerId: PLAYER, planetIndex: FORK_TIER, level, view },
    ),
  )
}

/** The item's vehicle-item and power-up rows: what slots, presses and draws it. */
function itemRowsOf(walked: WalkedForkBranch): unknown[] {
  const itemId = walked.node.unlocks.itemId
  return [
    ...contentOf('vehicle-item').filter((row) => row.id === itemId),
    ...contentOf('power-up').filter((row) => row.itemId === itemId),
  ]
}

/** Everything a chosen branch shows or does on P16, as one lower-case text. */
function chosenTextOf(walked: WalkedForkBranch): string {
  const { session, events } = chooseOnFork(walked)
  const card = nodeCardModelOf(session.state(), PLAYER, registeredTechTree(), walked.node.id)
  if (card === null) throw new Error(`no card for ${walked.node.id} on P${FORK_TIER}`)
  return JSON.stringify({
    events,
    card,
    itemCards: itemCardsOf(session, walked),
    itemRows: itemRowsOf(walked),
    piece: forkPieceOf(walked.lane, walked.branch),
  }).toLowerCase()
}

function walkedTextOf(walked: WalkedForkBranch): WalkedText {
  const text = walked.isHeld ? JSON.stringify(walked.authored).toLowerCase() : chosenTextOf(walked)
  return { id: walked.node.id, text }
}

function walkTwelveBranches(): WalkedText[] {
  return forkBranchesToWalk(registeredTechTree()).map(walkedTextOf)
}

function visionRowsIn(text: string): string[] {
  return VISION_ROWS.filter(
    (row) => text.includes(row.id) || text.includes(row.name.toLowerCase()),
  ).map((row) => row.id)
}

/** A family named on the card, or referenced by id as a whole value in the effect's rows. */
function laterFamiliesIn(text: string): string[] {
  return LATER_FAMILIES.filter(
    (family) => text.includes(family.name.toLowerCase()) || text.includes(`"${family.id}"`),
  ).map((family) => family.id)
}

function namedIn(walk: readonly WalkedText[], findNames: (text: string) => string[]) {
  return walk
    .map((walked) => ({ id: walked.id, names: findNames(walked.text) }))
    .filter((walked) => walked.names.length > 0)
}

describe('tech tree: the twelve fork branches at P16', () => {
  it('walks two branches in each of the six lanes, choosing every registered one', () => {
    const branches = forkBranchesToWalk(registeredTechTree())
    expect(branches).toHaveLength(12)
    const registered = branches.filter((walked) => !walked.isHeld)
    const chosen = registered.filter((walked) =>
      chooseOnFork(walked).events.some((event) => event.type === 'tech-tree.ForkChosen'),
    )
    expect(chosen.map((walked) => walked.node.id)).toEqual(registered.map((w) => w.node.id))
  })

  it('names no vision row on any branch card or in any branch effect', () => {
    expect(VISION_ROWS.length).toBeGreaterThan(0)
    expect(namedIn(walkTwelveBranches(), visionRowsIn)).toEqual([])
  })

  it('names no ore family 3-12 on any branch card or in any branch effect', () => {
    expect(LATER_FAMILIES).toHaveLength(10)
    expect(namedIn(walkTwelveBranches(), laterFamiliesIn)).toEqual([])
  })
})
