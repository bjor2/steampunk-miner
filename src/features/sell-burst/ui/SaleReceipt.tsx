/**
 * The sale receipt (ticket 717, spec #678) on the click-through layer above the bay screen (ticket
 * 220), beside the burst's coins: each kind the trip sold, grouped by rarity, with its count and
 * coin, the lining bill, the trip total rolling up and the last trip's total to compare. A tap
 * skips the roll, the next puts the receipt away; leaving the dock does too. It hears every batch
 * from the start, so the hold's kinds are known before the sale. Markup only: the view is
 * `receiptViewOf`.
 */
import { useEffect } from 'react'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { readAuthorityTick, useGameStore } from '../../../store/gameStore'
import { onFrame } from '../../../ui/projection/worldToScreen'
import { AmountText } from '../../../ui/kit/AmountText'
import { Odometer } from '../../../ui/kit/Odometer'
import { RarityName } from '../../../ui/kit/RarityName'
import { ScrollArea } from '../../../ui/kit/ScrollArea'
import { useReceiptStore } from '../store/receiptStore'
import {
  receiptViewOf,
  type LastTripView,
  type ReceiptGroupView,
  type ReceiptView,
} from '../systems/receiptView'
import type { TripReceipt } from '../systems/tripReceipt'
import styles from './SaleReceipt.module.css'

export const RECEIPT_TEST_IDS = {
  receipt: 'sell-burst-receipt',
  rows: 'sell-burst-receipt-rows',
  line: 'sell-burst-receipt-line',
  total: 'sell-burst-receipt-total',
  lining: 'sell-burst-receipt-lining',
  lastTrip: 'sell-burst-receipt-last-trip',
} as const

export function SaleReceipt() {
  useEffect(() => listenForDomainEvents(useReceiptStore.getState().hearReceiptBatch), [])
  const receipt = useReceiptStore((state) => state.receipt)
  const isShown = useReceiptStore((state) => state.isShown)
  if (receipt === null || !isShown) return null
  return <ShownReceipt receipt={receipt} />
}

function ShownReceipt({ receipt }: { receipt: TripReceipt }) {
  useEffect(() => onFrame(advanceReceiptFrame), [])
  const rollStep = useReceiptStore((state) => state.rollStep)
  const lastTripNet = useReceiptStore((state) => state.lastTripNet)
  const isMotionReduced = useGameStore((state) => !state.prefs.shake)
  const tapReceipt = useReceiptStore((state) => state.tapReceipt)
  const view = receiptViewOf({ receipt, rollStep, lastTripNet, isMotionReduced })
  return <ReceiptPlate view={view} onTap={tapReceipt} />
}

function ReceiptPlate({ view, onTap }: { view: ReceiptView; onTap: () => void }) {
  return (
    <section
      className={styles.receipt}
      data-testid={RECEIPT_TEST_IDS.receipt}
      data-rolling={view.isRolling || undefined}
      data-net={view.total.net.exact}
      data-lines={view.lineCount}
      onClick={onTap}
    >
      <h2 className={styles.title}>{view.title}</h2>
      <ScrollArea className={styles.rows} testId={RECEIPT_TEST_IDS.rows}>
        {view.groups.map((group) => (
          <ReceiptGroup key={group.key} group={group} />
        ))}
      </ScrollArea>
      {view.lining === null ? null : (
        <p className={styles.figure} data-testid={RECEIPT_TEST_IDS.lining}>
          <span>{view.lining.label}</span>
          <span className={styles.amount} data-exact={view.lining.paid.exact}>
            {view.lining.paid.text}
          </span>
        </p>
      )}
      <p className={styles.total}>
        <span>{view.total.label}</span>
        <Odometer
          text={view.total.shown.text}
          exact={view.total.shown.exact}
          testId={RECEIPT_TEST_IDS.total}
        />
      </p>
      <LastTrip lastTrip={view.lastTrip} />
    </section>
  )
}

function ReceiptGroup({ group }: { group: ReceiptGroupView }) {
  return (
    <div className={styles.group} data-rarity={group.key}>
      <h3 className={styles.heading}>
        <RarityName rarity={group.rarity}>{group.heading}</RarityName>
      </h3>
      <ul className={styles.lines}>
        {group.lines.map((line) => (
          <li key={line.key} className={styles.line} data-testid={RECEIPT_TEST_IDS.line}>
            <span className={styles.name}>{line.name}</span>
            <span className={styles.count}>{line.count}</span>
            <span className={styles.amount} data-exact={line.coin.exact}>
              <AmountText text={line.coin.text} exact={line.coin.exact} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LastTrip({ lastTrip }: { lastTrip: LastTripView }) {
  return (
    <p
      className={styles.figure}
      data-testid={RECEIPT_TEST_IDS.lastTrip}
      data-compare={lastTrip.compare ?? undefined}
    >
      <span>{lastTrip.label}</span>
      {lastTrip.total === null ? null : (
        <span className={styles.amount} data-exact={lastTrip.total.exact}>
          <span className={styles.glyph}>{lastTrip.glyph}</span> {lastTrip.total.text}
        </span>
      )}
    </p>
  )
}

function advanceReceiptFrame(): void {
  useReceiptStore.getState().advanceReceiptTo(readAuthorityTick())
}
