import { describe, expect, it } from 'vitest'
import { crc32Of, zipStoredEntries, type ZipEntry } from './storedZip'

const encoder = new TextEncoder()

interface ReadEntry {
  path: string
  bytes: Uint8Array
  storedCrc: number
}

/**
 * Reads a zip the way an unzip tool does: from the end of central directory record to each
 * central header, then to the local header it points at (PKWARE APPNOTE 4.3), so the test checks
 * the format and not the writer's own bookkeeping.
 */
function readZip(zip: Uint8Array): ReadEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const entries: ReadEntry[] = []
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    expect(view.getUint16(at + 10, true)).toBe(0) // stored
    const nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    entries.push(readLocalEntry(zip, view, local))
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
  }
  return entries
}

function readLocalEntry(zip: Uint8Array, view: DataView, at: number): ReadEntry {
  expect(view.getUint32(at, true)).toBe(0x04034b50)
  const size = view.getUint32(at + 18, true)
  const nameLength = view.getUint16(at + 26, true)
  const dataAt = at + 30 + nameLength + view.getUint16(at + 28, true)
  return {
    path: new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLength)),
    bytes: zip.slice(dataAt, dataAt + size),
    storedCrc: view.getUint32(at + 14, true),
  }
}

const SNAPSHOT_SET: ZipEntry[] = [
  { path: 'run_a/snapshots/save-300.json', bytes: encoder.encode('{"saveVersion":1}') },
  { path: 'run_a/shots/310-budget_breach.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
  { path: 'run_b/snapshots/save-0.json', bytes: new Uint8Array(0) },
]

describe('stored zip', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32Of(encoder.encode('123456789'))).toBe(0xcbf43926)
  })

  it('round-trips every file with its path, bytes and CRC', () => {
    const entries = readZip(zipStoredEntries(SNAPSHOT_SET))
    expect(entries.map((entry) => entry.path)).toEqual(SNAPSHOT_SET.map((entry) => entry.path))
    entries.forEach((entry, index) => {
      expect(entry.bytes).toEqual(SNAPSHOT_SET[index].bytes)
      expect(entry.storedCrc).toBe(crc32Of(entry.bytes))
    })
  })

  it('writes an empty set as a lone end of central directory record', () => {
    const zip = zipStoredEntries([])
    expect(zip).toHaveLength(22)
    expect(readZip(zip)).toEqual([])
  })

  it('zips one set of files to the same bytes every time', () => {
    expect(zipStoredEntries(SNAPSHOT_SET)).toEqual(zipStoredEntries(SNAPSHOT_SET))
  })
})
