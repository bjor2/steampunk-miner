/**
 * Reads the hazard archetypes of `economy.json` (spec #113 numbers): one block per act archetype,
 * the heat block first. Each band list holds bands 1 to 5 (the core's band, `ore.coreTierBand`, has
 * none); the throttle line sits inside the gauge; an archetype's planets are a non-empty range.
 */
import { readBandOreCost, type FieldReader } from './economyFieldReader'
import type { HazardArchetype } from './economyDefinition'
import type { BigStat } from '../money'

export function readArchetypes(
  reader: FieldReader,
  value: unknown,
  coreTierBand: number,
): HazardArchetype[] {
  return reader
    .list('archetypes', value)
    .map((archetype, index) =>
      readArchetype(reader, `archetypes[${index}]`, archetype, coreTierBand),
    )
}

function readArchetype(
  reader: FieldReader,
  path: string,
  value: unknown,
  coreTierBand: number,
): HazardArchetype {
  const archetype = reader.object(path, value)
  const read: HazardArchetype = {
    id: reader.text(`${path}.id`, archetype.id),
    planets: readPlanetRange(reader, `${path}.planets`, archetype.planets),
    bandHeatPerSecond: readBandList(
      reader,
      `${path}.bandHeatPerSecond`,
      archetype.bandHeatPerSecond,
    ),
    drillHeatPerSecond: reader.money(`${path}.drillHeatPerSecond`, archetype.drillHeatPerSecond),
    coolingPerSecond: readCooling(reader, `${path}.coolingPerSecond`, archetype.coolingPerSecond),
    gaugeMax: reader.safeInteger(`${path}.gaugeMax`, archetype.gaugeMax),
    throttleAt: reader.safeInteger(`${path}.throttleAt`, archetype.throttleAt),
    throttleFloor: reader.money(`${path}.throttleFloor`, archetype.throttleFloor),
    damageAtMaxPerSecond: reader.money(
      `${path}.damageAtMaxPerSecond`,
      archetype.damageAtMaxPerSecond,
    ),
    hazardContact: readContact(reader, `${path}.hazardContact`, archetype.hazardContact),
    hazardPocketVolume: readBandList(
      reader,
      `${path}.hazardPocketVolume`,
      archetype.hazardPocketVolume,
    ),
    tail: readTail(reader, `${path}.tail`, archetype.tail),
    liningType: reader.text(`${path}.liningType`, archetype.liningType),
    liningMultiplier: reader.money(`${path}.liningMultiplier`, archetype.liningMultiplier),
    liningUnlockCost: readBandOreCost(
      reader,
      `${path}.liningUnlockCost`,
      archetype.liningUnlockCost,
    ),
  }
  checkBandCounts(reader, path, read, coreTierBand - 1)
  checkGauge(reader, path, read)
  return read
}

function readPlanetRange(reader: FieldReader, path: string, value: unknown) {
  const planets = reader.object(path, value)
  const range = {
    first: reader.safeInteger(`${path}.first`, planets.first),
    last: reader.safeInteger(`${path}.last`, planets.last),
  }
  if (range.first < 1 || range.last < range.first) {
    reader.record(`${path} must run from a planet >= 1 to one at or after it`)
  }
  return range
}

function readBandList(reader: FieldReader, path: string, value: unknown): BigStat[] {
  return reader.list(path, value).map((entry, index) => reader.money(`${path}[${index}]`, entry))
}

function readCooling(reader: FieldReader, path: string, value: unknown) {
  const cooling = reader.object(path, value)
  return {
    idle: reader.money(`${path}.idle`, cooling.idle),
    liningCorridor: reader.money(`${path}.liningCorridor`, cooling.liningCorridor),
    surface: reader.money(`${path}.surface`, cooling.surface),
  }
}

function readContact(reader: FieldReader, path: string, value: unknown) {
  const contact = reader.object(path, value)
  return {
    heat: reader.safeInteger(`${path}.heat`, contact.heat),
    hullFraction: reader.money(`${path}.hullFraction`, contact.hullFraction),
  }
}

function readTail(reader: FieldReader, path: string, value: unknown) {
  const tail = reader.object(path, value)
  return {
    ratio: reader.money(`${path}.ratio`, tail.ratio),
    cap: reader.money(`${path}.cap`, tail.cap),
  }
}

function checkBandCounts(
  reader: FieldReader,
  path: string,
  archetype: HazardArchetype,
  bands: number,
): void {
  if (archetype.bandHeatPerSecond.length !== bands) {
    reader.record(`${path}.bandHeatPerSecond must list ${bands} bands`)
  }
  if (archetype.hazardPocketVolume.length !== bands) {
    reader.record(`${path}.hazardPocketVolume must list ${bands} bands`)
  }
}

function checkGauge(reader: FieldReader, path: string, archetype: HazardArchetype): void {
  if (archetype.throttleAt <= 0 || archetype.throttleAt >= archetype.gaugeMax) {
    reader.record(`${path}.throttleAt must lie inside the gauge, above 0 and below gaugeMax`)
  }
}
