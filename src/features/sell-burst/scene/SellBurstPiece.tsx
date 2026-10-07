/**
 * The sell burst in the world (#171 section 1), on the dock pad's `platform` layer: ore chunks in
 * their ore's colour arc from the Exchange's chute into its crown, and coins burst up out of its
 * stack and hang before their screen flight; the gold flare burns over the stack. Placeholder
 * quads until the #214 sprite sheets: two pooled instanced meshes, so a full burst is two draws.
 *
 * It is also the burst's clock: once a frame it hears the authority tick, advances the slice store
 * and plays the sounds that came due. Presentation only: it never writes the game store, the
 * camera or the authority.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { InstancedMesh } from 'three'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { readAuthorityTick, useGameStore } from '../../../store/gameStore'
import { readAuthorityState } from '../../../store/authorityLink'
import { getSoundOut } from '../../../shell/soundOut'
import { dockSiteOfPlanet } from '../../../systems/authority/planetOfState'
import { useSellBurstStore } from '../store/sellBurstStore'
import { playBurstCuesBetween, type BurstCuePlayer } from '../systems/burstCues'
import { burstCuePlayerOf } from './burstCuePlayer'
import {
  BURST_CHUNK_POOL,
  BURST_COIN_POOL,
  colourBurstPieces,
  createBurstPieces,
  placeBurstChunks,
  placeBurstCoins,
  type BurstPieces,
} from './burstPieces'
import { sellShopPointsOf, type SellShopPoints } from './sellShopPoints'

export function SellBurstPiece() {
  // The pad moves only with the planet: the points are re-read on travel or a new seed.
  const planetKey = useGameStore((state) => `${state.planetTier}:${state.planetSeed}`)
  const points = useMemo(() => shopPointsOfPlanet(planetKey), [planetKey])
  const chunks = useRef<InstancedMesh>(null)
  const coins = useRef<InstancedMesh>(null)
  const pieces = useMemo(createBurstPieces, [])
  const cues = useMemo(() => burstCuePlayerOf(getSoundOut()), [])
  useEffect(() => listenForDomainEvents(useSellBurstStore.getState().hearSales), [])
  useFrame(() => {
    const tick = readAuthorityTick()
    useSellBurstStore.getState().advanceSellBurstTo(tick)
    drawBurstAt(tick, points, chunks.current, coins.current, pieces)
    playCuesUpTo(tick, pieces, cues)
  })
  if (points === null) return null
  return (
    <>
      <instancedMesh
        ref={chunks}
        args={[undefined, undefined, BURST_CHUNK_POOL]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh
        ref={coins}
        args={[undefined, undefined, BURST_COIN_POOL]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
    </>
  )
}

function drawBurstAt(
  tick: number,
  points: SellShopPoints | null,
  chunks: InstancedMesh | null,
  coins: InstancedMesh | null,
  pieces: BurstPieces,
): void {
  const { burst } = useSellBurstStore.getState()
  if (points === null || chunks === null || coins === null) return
  colourBurstPieces(chunks, coins, burst, pieces)
  placeBurstChunks(chunks, burst, tick, points, pieces)
  placeBurstCoins(coins, burst, tick, points, pieces)
}

/** The sounds due since the last frame; a burst heard this frame plays from its sale on. */
function playCuesUpTo(tick: number, pieces: BurstPieces, cues: BurstCuePlayer): void {
  const { burst } = useSellBurstStore.getState()
  if (burst !== null) playBurstCuesBetween(burst, Math.min(pieces.cuedTick, tick - 1), tick, cues)
  pieces.cuedTick = tick
}

function shopPointsOfPlanet(_planetKey: string): SellShopPoints | null {
  const site = dockSiteOfPlanet(readAuthorityState().planet)
  return site === null ? null : sellShopPointsOf(site)
}
