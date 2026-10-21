/**
 * The money float-up's trigger (ticket 684; design section 6): the change since the money this
 * readout last showed, with a serial that grows on every change so the float-up replays. The
 * first money it sees floats nothing. Presentation only.
 */
import { useEffect, useRef, useState } from 'react'
import { moneyChangeOf, type MoneyChange } from '../../systems/views/hudStrip'

export interface ShownMoneyChange extends MoneyChange {
  serial: number
}

export function useMoneyChange(exact: string): ShownMoneyChange | null {
  const [change, setChange] = useState<ShownMoneyChange | null>(null)
  const shownExact = useRef(exact)
  useEffect(() => {
    const next = moneyChangeOf(shownExact.current, exact)
    shownExact.current = exact
    if (next !== null) setChange((kept) => ({ ...next, serial: (kept?.serial ?? 0) + 1 }))
  }, [exact])
  return change
}
