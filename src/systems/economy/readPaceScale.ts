/**
 * Reads `planets.paceScale` (#6 section 6, the balance lever): a default, a step function by
 * mechanic (`fromPlanet`, #131 Systems: a planet uses the last row at or below it) and single
 * planets (`byPlanet`), which win over both.
 */
import type { PaceScale, PaceScaleStep } from './economyDefinition'
import type { FieldReader } from './economyFieldReader'
import type { Money } from '../money'

export function readPaceScale(reader: FieldReader, value: unknown): PaceScale {
  const paceScale = reader.object('planets.paceScale', value)
  return {
    default: reader.money('planets.paceScale.default', paceScale.default),
    fromPlanet: readPaceScaleSteps(reader, paceScale.fromPlanet),
    byPlanet: readPaceScaleByPlanet(reader, paceScale.byPlanet),
  }
}

function readPaceScaleSteps(reader: FieldReader, value: unknown): PaceScaleStep[] {
  const path = 'planets.paceScale.fromPlanet'
  const steps = reader
    .list(path, value)
    .map((step, index) => readPaceScaleStep(reader, `${path}[${index}]`, step))
  if (!isClimbingFromPlanet1(steps)) {
    reader.record(`${path} must climb by planet from 1 or later, one row a planet`)
  }
  return steps
}

function readPaceScaleStep(reader: FieldReader, path: string, value: unknown): PaceScaleStep {
  const step = reader.object(path, value)
  return {
    from: reader.safeInteger(`${path}.from`, step.from),
    scale: reader.money(`${path}.scale`, step.scale),
  }
}

/** Each row starts on a later planet than the one before it, the first on planet 1 or later. */
function isClimbingFromPlanet1(steps: readonly PaceScaleStep[]): boolean {
  return steps.every((step, at) => step.from > (at === 0 ? 0 : steps[at - 1].from))
}

/** Keys are planet indexes written as JSON object keys ("3": "1.1"). */
function readPaceScaleByPlanet(reader: FieldReader, value: unknown): Map<number, Money> {
  const entries = Object.entries(reader.object('planets.paceScale.byPlanet', value))
  return new Map(
    entries.map(([key, scale]) => [
      readPlanetKey(reader, key),
      reader.money(`planets.paceScale.byPlanet.${key}`, scale),
    ]),
  )
}

function readPlanetKey(reader: FieldReader, key: string): number {
  const planetIndex = /^[1-9][0-9]*$/.test(key) ? Number.parseInt(key) : Number.NaN
  return reader.safeInteger(`planets.paceScale.byPlanet key ${key}`, planetIndex)
}
