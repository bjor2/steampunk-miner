/**
 * The unlock reveal's brass plate (ticket 718, spec #678 Progression 1) on the click-through layer
 * above the bay screen (ticket 220): `Gear fitted` and the bought item's icon and name, while the
 * part glows on the car below it. One tap anywhere on the plate skips the reveal. It hears every
 * batch from the start and steps the reveal on each frame's authority tick. Markup only: the view
 * is `revealPlateOf`.
 */
import { useEffect } from 'react'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { readAuthorityTick, useGameStore } from '../../../store/gameStore'
import { onFrame } from '../../../ui/projection/worldToScreen'
import { VectorIcon } from '../../../ui/VectorIcon'
import { useRevealStore } from '../store/revealStore'
import { revealPlateOf, type RevealPlate } from '../systems/revealPlate'
import type { UnlockReveal } from '../systems/unlockReveal'
import styles from './UnlockRevealPlate.module.css'

export const REVEAL_TEST_IDS = {
  plate: 'unlock-reveal-plate',
  name: 'unlock-reveal-name',
} as const

export function UnlockRevealPlate() {
  useEffect(() => listenForDomainEvents(useRevealStore.getState().hearRevealBatch), [])
  const reveal = useRevealStore((state) => state.reveal)
  if (reveal === null) return null
  return <ShownReveal reveal={reveal} />
}

function ShownReveal({ reveal }: { reveal: UnlockReveal }) {
  useEffect(() => onFrame(advanceRevealFrame), [])
  const skipReveal = useRevealStore((state) => state.skipReveal)
  const isMotionReduced = useGameStore((state) => !state.prefs.shake)
  return <RevealPlateView plate={revealPlateOf(reveal, isMotionReduced)} onSkip={skipReveal} />
}

function RevealPlateView({ plate, onSkip }: { plate: RevealPlate; onSkip: () => void }) {
  return (
    <button
      type="button"
      className={styles.plate}
      data-testid={REVEAL_TEST_IDS.plate}
      data-item={plate.itemKey}
      data-gleam={plate.hasGleam || undefined}
      aria-label={plate.skipLabel}
      onClick={onSkip}
    >
      <VectorIcon iconId={plate.iconId} size="banner" />
      <span className={styles.words}>
        <span className={styles.title}>{plate.title}</span>
        <span className={styles.name} data-testid={REVEAL_TEST_IDS.name}>
          {plate.name}
        </span>
      </span>
    </button>
  )
}

function advanceRevealFrame(): void {
  useRevealStore.getState().advanceRevealTo(readAuthorityTick())
}
