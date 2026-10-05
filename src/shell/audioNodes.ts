/**
 * The few Web Audio moves every synthesised sound shares: a gain node wired to where it plays, and
 * a level that glides to a new value instead of jumping, so nothing clicks. A level that has not
 * moved is not rescheduled, so a frame that re-levels everything builds nothing.
 */

/** Continuous levels glide toward a new value with this time constant, so they never click. */
const GLIDE_SECONDS = 0.04
/** A level closer than this to where it is heading is left alone. */
const UNHEARD_CHANGE = 0.0005

/** The quietest level an exponential envelope can start from or fade to. */
export const SILENCE = 0.0001

export function gainOf(context: AudioContext, gain: number, destination: AudioNode): GainNode {
  const node = new GainNode(context, { gain })
  node.connect(destination)
  return node
}

const headingTo = new WeakMap<AudioParam, number>()

export function glide(context: AudioContext, param: AudioParam, value: number): void {
  const heading = headingTo.get(param)
  if (heading !== undefined && Math.abs(heading - value) < UNHEARD_CHANGE) return
  headingTo.set(param, value)
  param.setTargetAtTime(value, context.currentTime, GLIDE_SECONDS)
}
