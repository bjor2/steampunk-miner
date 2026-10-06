import { describe, expect, it } from 'vitest'
import { countListenersOn } from './listenerCount'

/** Node's own EventTarget, counted through a subclass so the global prototype stays untouched. */
function countedTargets() {
  class CountedTarget extends EventTarget {}
  const count = countListenersOn(CountedTarget.prototype)
  return { count, makeTarget: () => new CountedTarget() }
}

const onTick = () => undefined
const onTock = () => undefined

describe('listener count', () => {
  it('counts each listener added and stops counting it once removed', () => {
    const { count, makeTarget } = countedTargets()
    const target = makeTarget()
    target.addEventListener('tick', onTick)
    target.addEventListener('tock', onTock)
    expect(count.live()).toBe(2)
    target.removeEventListener('tick', onTick)
    expect(count.live()).toBe(1)
  })

  it('counts a listener added twice once, as the DOM keeps it once', () => {
    const { count, makeTarget } = countedTargets()
    const target = makeTarget()
    target.addEventListener('tick', onTick)
    target.addEventListener('tick', onTick, { passive: true })
    expect(count.live()).toBe(1)
  })

  it('counts the capture and bubble registrations of one listener apart', () => {
    const { count, makeTarget } = countedTargets()
    const target = makeTarget()
    target.addEventListener('tick', onTick, true)
    target.addEventListener('tick', onTick)
    target.removeEventListener('tick', onTick, { capture: true })
    expect(count.live()).toBe(1)
  })

  it('counts the same listener on two targets twice', () => {
    const { count, makeTarget } = countedTargets()
    makeTarget().addEventListener('tick', onTick)
    makeTarget().addEventListener('tick', onTick)
    expect(count.live()).toBe(2)
  })

  it('ignores removing a listener that was never added', () => {
    const { count, makeTarget } = countedTargets()
    const target = makeTarget()
    target.addEventListener('tick', onTick)
    target.removeEventListener('tock', onTick)
    target.removeEventListener('tick', onTock)
    expect(count.live()).toBe(1)
  })

  it('leaves out once listeners, which remove themselves', () => {
    const { count, makeTarget } = countedTargets()
    makeTarget().addEventListener('tick', onTick, { once: true })
    expect(count.live()).toBe(0)
  })

  it('stops counting a listener when its signal aborts', () => {
    const { count, makeTarget } = countedTargets()
    const stop = new AbortController()
    makeTarget().addEventListener('tick', onTick, { signal: stop.signal })
    expect(count.live()).toBe(1)
    stop.abort()
    expect(count.live()).toBe(0)
  })

  it('still delivers events to the listeners it counts', () => {
    const { makeTarget } = countedTargets()
    const target = makeTarget()
    let heard = 0
    target.addEventListener('tick', () => heard++)
    target.dispatchEvent(new Event('tick'))
    expect(heard).toBe(1)
  })
})
