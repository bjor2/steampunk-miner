/**
 * The contact sheet of the icon set (#158 "Build acceptance", #163): every icon at 1x (24 px) and
 * 2x (48 px) on the dark panel and on the light one, then the same in grayscale and under a
 * deuteranopia simulation, and the six combat statuses at 20, 24 and 32 px, plus a row of
 * generated ore icons across the grades. One SVG, composed from the same drawings the game ships,
 * so the sheet can never show an icon the game does not. Pure string building; `npm run
 * art:icons` writes it to `docs/art/icons/`.
 */
import {
  COMBAT_STATUS_IDS,
  combatStatusIconIdOf,
  iconEntries,
  iconEntryOf,
  type IconEntry,
} from './iconSet'
import { drawingOfEntry, innerLinesOf, ICON_GRID } from './iconSvg'
import { oreIconDrawingOf, type OreIconRequest } from './oreIcon'

export const CONTACT_SHEET_PATH = 'docs/art/icons/contact-sheet.svg'

const DARK_PANEL = '#1b1613'
const LIGHT_PANEL = '#e9dcc0'
const DARK_TEXT = '#e9dcc0'
const LIGHT_TEXT = '#1b1613'

const COLUMNS = 13
const CELL = 96
const LABEL_SIZE = 9
const PANEL_GAP = 24
const MARGIN = 16

const STATUS_SIZES = [20, 24, 32] as const

/** Tier samples across the five grades, both families and the Sell bay's mixed rows. */
const ORE_SAMPLES: readonly OreIconRequest[] = [
  { family: 'metal', tier: 1 },
  { family: 'metal', tier: 7 },
  { family: 'metal', tier: 20 },
  { family: 'metal', tier: 45 },
  { family: 'metal', tier: 90 },
  { family: 'crystal', tier: 1 },
  { family: 'crystal', tier: 7 },
  { family: 'crystal', tier: 20 },
  { family: 'crystal', tier: 45 },
  { family: 'crystal', tier: 90 },
  { family: 'mixed', tier: 3 },
  { family: 'mixed', tier: 30 },
  { family: 'mixed', tier: 124 },
]

/**
 * Deuteranopia as the Machado, Oliveira and Fernandes (2009) matrix at full severity, the
 * simulation the design reviews use.
 */
const DEUTERANOPIA_MATRIX =
  '0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0'

interface SheetSymbol {
  id: string
  title: string
  lines: string[]
}

interface Panel {
  title: string
  background: string
  text: string
  filter: string | null
  scale: 1 | 2
}

const PANELS: readonly Panel[] = [
  {
    title: 'Dark panel, 1x (24 px)',
    background: DARK_PANEL,
    text: DARK_TEXT,
    filter: null,
    scale: 1,
  },
  {
    title: 'Dark panel, 2x (48 px)',
    background: DARK_PANEL,
    text: DARK_TEXT,
    filter: null,
    scale: 2,
  },
  { title: 'Light panel, 1x', background: LIGHT_PANEL, text: LIGHT_TEXT, filter: null, scale: 1 },
  { title: 'Light panel, 2x', background: LIGHT_PANEL, text: LIGHT_TEXT, filter: null, scale: 2 },
  {
    title: 'Grayscale, dark, 1x',
    background: DARK_PANEL,
    text: DARK_TEXT,
    filter: 'grayscale',
    scale: 1,
  },
  {
    title: 'Grayscale, light, 1x',
    background: LIGHT_PANEL,
    text: LIGHT_TEXT,
    filter: 'grayscale',
    scale: 1,
  },
  {
    title: 'Deuteranopia, dark, 1x',
    background: DARK_PANEL,
    text: DARK_TEXT,
    filter: 'deuteranopia',
    scale: 1,
  },
  {
    title: 'Deuteranopia, light, 1x',
    background: LIGHT_PANEL,
    text: LIGHT_TEXT,
    filter: 'deuteranopia',
    scale: 1,
  },
]

/** The files the generator writes: the sheet, keyed by its repo path. */
export function contactSheetFiles(): Readonly<Record<string, string>> {
  return { [CONTACT_SHEET_PATH]: contactSheetSvg() }
}

export function contactSheetSvg(): string {
  const symbols = [...iconEntries().map(symbolOfEntry), ...ORE_SAMPLES.map(symbolOfOre)]
  const setIds = iconEntries().map((entry) => entry.id)
  const oreIds = ORE_SAMPLES.map(oreSymbolId)
  const blocks = [
    ...PANELS.map((panel) => gridBlock(panel, [...setIds, ...oreIds], symbols)),
    statusBlock(),
  ]
  return stackBlocks(symbols, blocks)
}

interface Block {
  height: number
  /** The block's elements, drawn at y = 0; the stacker translates them. */
  lines: string[]
}

function stackBlocks(symbols: SheetSymbol[], blocks: Block[]): string {
  const width = MARGIN * 2 + COLUMNS * CELL
  const height = blocks.reduce((sum, block) => sum + block.height + PANEL_GAP, MARGIN)
  let y = MARGIN
  const placed = blocks.map((block) => {
    const group = `<g transform="translate(${MARGIN} ${y})">${block.lines.join('')}</g>`
    y += block.height + PANEL_GAP
    return group
  })
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="ui-monospace, monospace">`,
    `  <title>Icon set contact sheet (#158, #163)</title>`,
    `  <defs>`,
    `    <filter id="grayscale"><feColorMatrix type="saturate" values="0"/></filter>`,
    `    <filter id="deuteranopia"><feColorMatrix type="matrix" values="${DEUTERANOPIA_MATRIX}"/></filter>`,
    ...symbols.map(symbolElement),
    `  </defs>`,
    `  <rect width="${width}" height="${height}" fill="#4a4034"/>`,
    ...placed.map((group) => `  ${group}`),
    '</svg>',
    '',
  ].join('\n')
}

function symbolOfEntry(entry: IconEntry): SheetSymbol {
  return { id: entry.id, title: entry.title, lines: innerLinesOf(drawingOfEntry(entry)) }
}

function symbolOfOre(request: OreIconRequest): SheetSymbol {
  const drawing = oreIconDrawingOf(request)
  return { id: oreSymbolId(request), title: drawing.title, lines: innerLinesOf(drawing) }
}

function oreSymbolId(request: OreIconRequest): string {
  return `icon-ore-${request.family}-t${request.tier}`
}

function symbolElement(symbol: SheetSymbol): string {
  return `    <symbol id="${symbol.id}" viewBox="0 0 ${ICON_GRID} ${ICON_GRID}">${symbol.lines.join('')}</symbol>`
}

/** Every icon in a grid of labelled cells, the whole panel under one filter. */
function gridBlock(panel: Panel, ids: string[], symbols: SheetSymbol[]): Block {
  const rows = Math.ceil(ids.length / COLUMNS)
  const height = 28 + rows * CELL
  const cells = ids.map((id, at) => cellOf(panel, id, at, symbols))
  const filter = panel.filter === null ? '' : ` filter="url(#${panel.filter})"`
  return {
    height,
    lines: [
      `<rect width="${COLUMNS * CELL}" height="${height}" fill="${panel.background}"/>`,
      `<text x="8" y="18" font-size="12" fill="${panel.text}">${panel.title}</text>`,
      `<g transform="translate(0 28)"${filter}>${cells.join('')}</g>`,
    ],
  }
}

function cellOf(panel: Panel, id: string, at: number, symbols: SheetSymbol[]): string {
  const size = ICON_GRID * panel.scale
  const x = (at % COLUMNS) * CELL + (CELL - size) / 2
  const y = Math.floor(at / COLUMNS) * CELL + 12
  const label = symbols.find((symbol) => symbol.id === id)?.title ?? id
  const labelX = (at % COLUMNS) * CELL + CELL / 2
  const labelY = Math.floor(at / COLUMNS) * CELL + 12 + size + 14
  return (
    `<use href="#${id}" x="${x}" y="${y}" width="${size}" height="${size}"/>` +
    `<text x="${labelX}" y="${labelY}" font-size="${LABEL_SIZE}" text-anchor="middle" fill="${panel.text}">${escapeText(label)}</text>`
  )
}

/** The six combat statuses at the three HUD sizes, on the dark panel, plain and grayscale. */
function statusBlock(): Block {
  const rowHeight = 56
  const height = 28 + STATUS_SIZES.length * rowHeight
  const rows = STATUS_SIZES.flatMap((size, row) =>
    COMBAT_STATUS_IDS.flatMap((status, column) => statusCell(size, row, column, status)),
  )
  return {
    height,
    lines: [
      `<rect width="${COLUMNS * CELL}" height="${height}" fill="${DARK_PANEL}"/>`,
      `<text x="8" y="18" font-size="12" fill="${DARK_TEXT}">The six combat statuses at 20, 24 and 32 px, plain and in grayscale</text>`,
      `<g transform="translate(0 28)">${rows.join('')}</g>`,
    ],
  }
}

function statusCell(
  size: number,
  row: number,
  column: number,
  status: (typeof COMBAT_STATUS_IDS)[number],
): string[] {
  const id = combatStatusIconIdOf(status)
  const title = iconEntryOf(id)?.title ?? id
  const y = row * 56 + 8
  const plainX = column * CELL + 16
  const grayX = (column + 6) * CELL + 16
  return [
    `<use href="#${id}" x="${plainX}" y="${y}" width="${size}" height="${size}"/>`,
    `<text x="${plainX}" y="${y + 44}" font-size="${LABEL_SIZE}" fill="${DARK_TEXT}">${escapeText(title)} ${size}</text>`,
    `<g filter="url(#grayscale)"><use href="#${id}" x="${grayX}" y="${y}" width="${size}" height="${size}"/></g>`,
  ]
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
