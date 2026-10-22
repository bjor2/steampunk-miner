/**
 * The gauge cluster's table (spec #678, ticket 716; docs/ui/design-system.md section 9): the
 * strip's dials as a data list, the way the tool slot bar's tools are rows (#691). Each row names
 * the reading it shows and its skin; the list's order is the draw order and the priority, so a
 * strip with less room than rows keeps the first and folds the rest into the overflow count. The
 * room is per layout and per place: on a phone the surface strip also carries the money and the
 * next-upgrade chip (#684), so it holds fewer dials than in a run. The dial zones (amber at 25%,
 * red at 10% of what a reading has left) and the skins' art are data too. HS (22 Oct): a module
 * or a wagon never gets its own HUD element, so a new reading kind is a ticket; a skin names baked
 * UI art by part id, and a part with no final, exported asset fails the load
 * (`gaugeSkinArtProblemsOf`). Pure; the file is read here once.
 */
import TABLE_FILE from '../../data/hud/gaugeCluster.json'
import { exportedSidecarOf, manifestEntryOf, type ArtCatalogue } from '../art/artCatalogue'
import { uiArtPartIds, uiAssetIdOfPart } from '../art/uiArt'
import type { LayoutKind } from './designSystem'

/** What a dial reads: the hull, the fuel, the cargo chain, the heat or the depth and core. */
export const DIAL_READINGS = ['hull', 'fuel', 'cargo-chain', 'heat', 'depth'] as const

export type DialReadingKind = (typeof DIAL_READINGS)[number]

/** Where the strip is: on the surface (money and chip beside it) or down a run. */
export type StripPlace = 'surface' | 'run'

export interface DialRow {
  id: string
  reads: DialReadingKind
  skin: string
}

/** The baked parts a dial draws: the bezel and face, and the needle turned over it. */
export interface DialSkin {
  dial: string
  needle: string
}

export interface DialZones {
  amberAtPercent: number
  redAtPercent: number
}

export interface GaugeClusterTable {
  dials: readonly DialRow[]
  /** How many dials a strip draws before the rest fold into the overflow count. */
  room: Readonly<Record<LayoutKind, Readonly<Record<StripPlace, number>>>>
  zones: DialZones
  /** The nine-slice brass and glass frame the cluster sits in. */
  frame: string
  skins: Readonly<Record<string, DialSkin>>
}

export const GAUGE_CLUSTER: GaugeClusterTable = TABLE_FILE as GaugeClusterTable

/** Why the table cannot be drawn; empty when every row, room, zone and skin holds. */
export function gaugeClusterProblemsOf(table: GaugeClusterTable): string[] {
  return [
    ...duplicateRowProblems(table.dials),
    ...table.dials.flatMap((row) => rowProblems(row, table)),
    ...roomProblems(table.room),
    ...zoneProblems(table.zones),
    ...drawnPartIdsOf(table).flatMap(unnamedPartProblems),
  ]
}

/** Every part the table draws must be on a final asset the export shipped (HS: the load test). */
export function gaugeSkinArtProblemsOf(table: GaugeClusterTable, art: ArtCatalogue): string[] {
  return drawnPartIdsOf(table)
    .filter((partId) => !isShippedPart(art, partId))
    .map((partId) => `"${partId}" is not a shipped UI sprite`)
}

/** The part ids the table draws: the frame and each skin's dial and needle, once each. */
export function drawnPartIdsOf(table: GaugeClusterTable): string[] {
  const skinParts = Object.values(table.skins).flatMap((skin) => [skin.dial, skin.needle])
  return [...new Set([table.frame, ...skinParts])]
}

function duplicateRowProblems(rows: readonly DialRow[]): string[] {
  const ids = rows.map((row) => row.id)
  return ids
    .filter((id, at) => ids.indexOf(id) !== at)
    .map((id) => `dial "${id}" is listed more than once`)
}

function rowProblems(row: DialRow, table: GaugeClusterTable): string[] {
  return [
    ...(DIAL_READINGS.includes(row.reads) ? [] : [`dial "${row.id}" reads "${row.reads}"`]),
    ...(row.skin in table.skins ? [] : [`dial "${row.id}" names no skin "${row.skin}"`]),
  ]
}

function roomProblems(room: GaugeClusterTable['room']): string[] {
  return Object.entries(room).flatMap(([kind, places]) =>
    Object.entries(places)
      .filter(([, count]) => !Number.isInteger(count) || count < 1)
      .map(([place, count]) => `room.${kind}.${place} is ${count}, not a whole number from 1`),
  )
}

function zoneProblems({ amberAtPercent, redAtPercent }: DialZones): string[] {
  const isOrdered = 0 <= redAtPercent && redAtPercent < amberAtPercent && amberAtPercent <= 100
  return isOrdered ? [] : [`zones must hold 0 <= red ${redAtPercent} < amber ${amberAtPercent}`]
}

function unnamedPartProblems(partId: string): string[] {
  return uiArtPartIds().includes(partId) ? [] : [`"${partId}" is no art token's UI sprite`]
}

function isShippedPart(art: ArtCatalogue, partId: string): boolean {
  const assetId = uiAssetIdOfPart(partId)
  if (assetId === null || manifestEntryOf(art, assetId)?.status !== 'final') return false
  const parts = exportedSidecarOf(art, assetId)?.parts ?? []
  return parts.some((part) => part.id === partId)
}
