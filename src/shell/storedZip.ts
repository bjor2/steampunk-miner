/**
 * A "stored" (uncompressed) zip of a debug run's snapshot files, for the browser's one-zip export
 * (#123 locked answer 2: hand-written, no new dependency). PKWARE APPNOTE 6.3.10 sections 4.3.7
 * (local file header), 4.3.12 (central directory header) and 4.3.16 (end of central directory),
 * method 0 with a CRC-32 per entry. No zip64: the browser keeps saves and screenshots only, far
 * under 4 GiB. Every entry carries the DOS epoch (1980-01-01 00:00), so one set of files always
 * zips to the same bytes.
 */

export interface ZipEntry {
  /** Forward-slash path inside the zip, e.g. `run_x/shots/18000-planet_change.png`. */
  path: string
  bytes: Uint8Array
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const LOCAL_HEADER_BYTES = 30
const CENTRAL_HEADER_BYTES = 46
const END_OF_CENTRAL_DIRECTORY_BYTES = 22
/** 1.0: the version a stored entry needs (APPNOTE 4.4.3.2). */
const VERSION_STORED = 10
/** Bit 11: names are UTF-8 (APPNOTE 4.4.4). */
const UTF8_NAMES_FLAG = 0x0800
const METHOD_STORED = 0
/** 1980-01-01 as a DOS date: day 1, month 1, year 0 (APPNOTE 4.4.6). */
const DOS_EPOCH_DATE = (1 << 5) | 1
const MAX_ZIP_BYTES = 0xffffffff
const MAX_ENTRIES = 0xffff

interface PlacedEntry {
  name: Uint8Array
  bytes: Uint8Array
  crc: number
  offset: number
}

export function zipStoredEntries(entries: readonly ZipEntry[]): Uint8Array {
  const placed = placeEntries(entries)
  const zip = new Uint8Array(zipSizeOf(placed))
  const view = new DataView(zip.buffer)
  const directoryOffset = writeLocalEntries(zip, view, placed)
  const directoryEnd = writeCentralDirectory(zip, view, placed, directoryOffset)
  writeEndOfCentralDirectory(view, placed.length, directoryOffset, directoryEnd)
  return zip
}

function placeEntries(entries: readonly ZipEntry[]): PlacedEntry[] {
  if (entries.length > MAX_ENTRIES)
    throw new Error(`a stored zip holds at most ${MAX_ENTRIES} files`)
  const encoder = new TextEncoder()
  let offset = 0
  return entries.map((entry) => {
    const name = encoder.encode(entry.path)
    const placedEntry = { name, bytes: entry.bytes, crc: crc32Of(entry.bytes), offset }
    offset += LOCAL_HEADER_BYTES + name.length + entry.bytes.length
    return placedEntry
  })
}

function zipSizeOf(placed: readonly PlacedEntry[]): number {
  const size = placed.reduce(
    (total, entry) =>
      total +
      LOCAL_HEADER_BYTES +
      CENTRAL_HEADER_BYTES +
      2 * entry.name.length +
      entry.bytes.length,
    END_OF_CENTRAL_DIRECTORY_BYTES,
  )
  if (size > MAX_ZIP_BYTES) throw new Error('a stored zip without zip64 stays under 4 GiB')
  return size
}

/** Returns where the central directory starts. */
function writeLocalEntries(
  zip: Uint8Array,
  view: DataView,
  placed: readonly PlacedEntry[],
): number {
  let at = 0
  for (const entry of placed) {
    view.setUint32(at, LOCAL_HEADER_SIGNATURE, true)
    writeSharedHeaderFields(view, at + 4, entry)
    zip.set(entry.name, at + LOCAL_HEADER_BYTES)
    zip.set(entry.bytes, at + LOCAL_HEADER_BYTES + entry.name.length)
    at += LOCAL_HEADER_BYTES + entry.name.length + entry.bytes.length
  }
  return at
}

/** Returns where the central directory ends. */
function writeCentralDirectory(
  zip: Uint8Array,
  view: DataView,
  placed: readonly PlacedEntry[],
  directoryOffset: number,
): number {
  let at = directoryOffset
  for (const entry of placed) {
    view.setUint32(at, CENTRAL_HEADER_SIGNATURE, true)
    view.setUint16(at + 4, VERSION_STORED, true) // version made by: 1.0, MS-DOS attributes
    writeSharedHeaderFields(view, at + 6, entry)
    // File comment length, disk number, internal and external attributes: all zero.
    view.setUint32(at + 42, entry.offset, true)
    zip.set(entry.name, at + CENTRAL_HEADER_BYTES)
    at += CENTRAL_HEADER_BYTES + entry.name.length
  }
  return at
}

/** Version needed through name length: the same 24 bytes in a local and a central header. */
function writeSharedHeaderFields(view: DataView, at: number, entry: PlacedEntry): void {
  view.setUint16(at, VERSION_STORED, true)
  view.setUint16(at + 2, UTF8_NAMES_FLAG, true)
  view.setUint16(at + 4, METHOD_STORED, true)
  view.setUint16(at + 6, 0, true) // DOS time 00:00:00
  view.setUint16(at + 8, DOS_EPOCH_DATE, true)
  view.setUint32(at + 10, entry.crc, true)
  view.setUint32(at + 14, entry.bytes.length, true) // compressed size: stored, so the same
  view.setUint32(at + 18, entry.bytes.length, true)
  view.setUint16(at + 22, entry.name.length, true)
  // The extra field length (the next two bytes) stays zero.
}

function writeEndOfCentralDirectory(
  view: DataView,
  entryCount: number,
  directoryOffset: number,
  directoryEnd: number,
): void {
  const at = directoryEnd
  view.setUint32(at, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true)
  // This disk and the directory's disk: both zero.
  view.setUint16(at + 8, entryCount, true)
  view.setUint16(at + 10, entryCount, true)
  view.setUint32(at + 12, directoryEnd - directoryOffset, true)
  view.setUint32(at + 16, directoryOffset, true)
  // Comment length stays zero.
}

/** CRC-32 with the reflected polynomial 0xEDB88320 (APPNOTE 4.4.7). */
const CRC_TABLE = buildCrcTable()

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

export function crc32Of(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
