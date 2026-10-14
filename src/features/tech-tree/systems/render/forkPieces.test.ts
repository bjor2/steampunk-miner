import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { vehicleOf } from '../../../../systems/authority/authorityState'
import type { BotSession } from '../../../../systems/bot/botSession'
import { FORK_FIXTURE_SLICE } from '../../treeFixtureSlice'
import { PLAYER, sessionOnPlanet, withFixtureTree } from '../../treeTestSession'
import { forkChoicesOf } from '../forkSection'
import type { TechLane } from '../techNode'
import {
  FORK_PIECES,
  forkMountsOf,
  forkPieceItemsOf,
  forkPieceProblemsOf,
  type ForkPiece,
} from './forkPieces'
import { forkTurntableRequestsOf } from './forkTurntable'
import { rigItemsWithForksOf, rigMountsOf, rigSidecarOf } from './rigGear'

/** The twelve branches of the GD lock on #255. */
const BRANCHES: readonly (readonly [TechLane, string])[] = [
  ['drill-gear', 'wide'],
  ['drill-gear', 'deep'],
  ['mobility', 'agile'],
  ['mobility', 'armoured'],
  ['extraction', 'hauler'],
  ['extraction', 'prospector'],
  ['sensing', 'scout'],
  ['sensing', 'diviner'],
  ['terrain', 'bracer'],
  ['terrain', 'breaker'],
  ['aetheric', 'phase'],
  ['aetheric', 'arc'],
]

const VEHICLE = rigSidecarOf(SHIPPED_ART)!

function withForks<T>(run: () => T): T {
  return withFixtureTree(run, [FORK_FIXTURE_SLICE])
}

function forkSubmit(session: BotSession, type: 'choose_fork' | 'rechoose_fork', branch: string) {
  return session.submit({ type: `tech-tree.${type}`, payload: { lane: 'drill-gear', branch } })
}

function dockAtWorks(session: BotSession): void {
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
}

/** What the rig hangs for the player now: each asset at its point. */
function rigLookOf(session: BotSession): string[] {
  const state = session.state()
  const items = rigItemsWithForksOf(vehicleOf(state, PLAYER).loadout, forkChoicesOf(state, PLAYER))
  return rigMountsOf(SHIPPED_ART, VEHICLE, items).map((m) => `${m.attachId} ${m.assetId}`)
}

describe('tech tree: fork branch pieces (ticket 270)', () => {
  it('every branch resolves at least one #235 piece that draws on the vehicle', () => {
    for (const [lane, branch] of BRANCHES) {
      const mounts = forkMountsOf(lane, branch)
      const drawn = rigMountsOf(SHIPPED_ART, VEHICLE, forkPieceItemsOf({ [lane]: branch }))
      expect(mounts.length, `${lane}/${branch}`).toBeGreaterThan(0)
      expect(drawn.map(({ assetId, attachId }) => ({ assetId, attachId }))).toEqual(mounts)
      expect(
        drawn.every((mount) => mount.quads.length > 0),
        `${lane}/${branch}`,
      ).toBe(true)
    }
  })

  it('dresses each lane two ways, never in a power-up slot or a shared drill socket', () => {
    expect(forkPieceProblemsOf()).toEqual([])
    const slotted: ForkPiece = { ...FORK_PIECES[0], gear: ['power.steam_boost'] }
    const socketed: ForkPiece = { ...FORK_PIECES[1], gear: ['gear.twin_bit'] }
    expect(forkPieceProblemsOf([slotted, socketed, ...FORK_PIECES.slice(2)])).toEqual([
      'drill-gear/wide: power.steam_boost draws only in a power-up slot',
      'drill-gear/deep: gear.twin_bit shares its drill socket with other gear',
    ])
  })

  it('shows only the active branch of a lane, and nothing before the lane chooses', () => {
    expect(forkPieceItemsOf({})).toEqual([])
    expect(forkPieceItemsOf({ 'drill-gear': 'deep', sensing: 'scout' })).toEqual([
      { itemId: 'power.echo_sounder', slot: null },
      { itemId: 'rig.resonance', slot: null },
    ])
  })

  it('picking a branch changes a visible part of the rig, and a re-choice swaps it', () => {
    withForks(() => {
      const session = sessionOnPlanet(16)
      const bare = rigLookOf(session)
      forkSubmit(session, 'choose_fork', 'wide')
      const wide = rigLookOf(session)
      dockAtWorks(session)
      forkSubmit(session, 'rechoose_fork', 'deep')
      expect(bare).toEqual([])
      expect(wide).toEqual(['drill.flank vehicle-item-gear-side-cutters'])
      expect(rigLookOf(session)).toEqual(['drill.fork vehicle-item-rig-resonance'])
    })
  })

  it('re-choice emits the #177 turntable request that faces the new piece to the camera', () => {
    withForks(() => {
      const session = sessionOnPlanet(16)
      const chosen = forkSubmit(session, 'choose_fork', 'wide')
      dockAtWorks(session)
      const rechosen = forkSubmit(session, 'rechoose_fork', 'deep')
      expect(forkTurntableRequestsOf(chosen, PLAYER)).toEqual([])
      expect(forkTurntableRequestsOf(rechosen, 'p2')).toEqual([])
      expect(forkTurntableRequestsOf(rechosen, PLAYER)).toEqual([
        {
          lane: 'drill-gear',
          branch: 'deep',
          attachId: 'drill.fork',
          faceTurnRadians: 0.5,
          tick: session.state().tick,
        },
      ])
    })
  })
})
