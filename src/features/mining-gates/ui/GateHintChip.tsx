/**
 * The gate hint chip (ticket 238; #142 "HUD hint chip"): the gate-kind icon and one ledger line
 * naming what a stopped cell needs and what the miner has, shown once per cell per dive in the
 * HUD's prompts slot, above the dock prompt. It is also the refusal text: the drill says nothing
 * else when a gate stops it. Never clicked. Reads only the gate hint store.
 */
import { useMemo } from 'react'
import { VectorIcon } from '../../../ui/VectorIcon'
import { useGateHintStore } from '../store/gateHintStore'
import { chipShownAt, type GateChip } from '../systems/gateChipBoard'
import { MINING_GATES_TEST_IDS } from './testIds'
import { useGateHintClock } from './useGateHintClock'
import { useGateHintFeed } from './useGateHintFeed'
import styles from './GateHintChip.module.css'

export function GateHintChip() {
  useGateHintFeed()
  const board = useGateHintStore((state) => state.board)
  const tick = useGateHintStore((state) => state.tick)
  const chip = useMemo(() => chipShownAt(board, tick), [board, tick])
  useGateHintClock(chip !== null)
  if (chip === null) return null
  return <GateHintChipView chip={chip} />
}

export function GateHintChipView({ chip }: { chip: GateChip }) {
  return (
    <div
      className={styles.chip}
      role="status"
      data-testid={MINING_GATES_TEST_IDS.hintChip}
      data-gate-kind={chip.gateKind}
      data-outcome={chip.outcome}
      data-tile={`${chip.tx},${chip.ty}`}
    >
      <VectorIcon iconId={chip.iconId} size="hud" />
      <span>{chip.line}</span>
    </div>
  )
}
