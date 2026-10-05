/**
 * Reads the header of a KTX2 file (Khronos KTX 2.0 specification, sections 3.1 to 3.10) far
 * enough to check #52 acceptance 2: sides at most 4096 px and powers of two, normal maps Basis
 * UASTC, albedo and emissive Basis ETC1S, each in its colour space (#52 "Formats").
 */
import { isAtlasSide } from './partsSidecar'
import { ART_RULES, type MapKind } from './artIds'

export type Ktx2Encoding = 'etc1s' | 'uastc' | 'other'

export type Ktx2TransferFunction = 'linear' | 'srgb' | 'other'

export interface Ktx2Header {
  width: number
  height: number
  encoding: Ktx2Encoding
  transfer: Ktx2TransferFunction
}

const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]
const PIXEL_WIDTH_AT = 20
const PIXEL_HEIGHT_AT = 24
const SUPERCOMPRESSION_AT = 44
const DFD_OFFSET_AT = 48
/** Within the data format descriptor: its total size, then the basic block's two header words. */
const COLOR_MODEL_IN_DFD = 12
const TRANSFER_IN_DFD = 14
const SUPERCOMPRESSION_BASIS_LZ = 1
/** `KHR_DF_MODEL_ETC1S` and `KHR_DF_MODEL_UASTC` (Khronos Data Format 1.3, section 5.6). */
const COLOR_MODEL_ETC1S = 163
const COLOR_MODEL_UASTC = 166
const TRANSFER_LINEAR = 1
const TRANSFER_SRGB = 2

/** Encoding and colour space per map (#52 "Formats"): normals are linear and need UASTC. */
const MAP_FORMATS: Readonly<Record<MapKind, Pick<Ktx2Header, 'encoding' | 'transfer'>>> = {
  albedo: { encoding: 'etc1s', transfer: 'srgb' },
  normal: { encoding: 'uastc', transfer: 'linear' },
  emissive: { encoding: 'etc1s', transfer: 'srgb' },
}

/** The header of a KTX2 file, or null when the bytes are not one. */
export function readKtx2Header(bytes: Uint8Array): Ktx2Header | null {
  if (!hasKtx2Identifier(bytes)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dfd = view.getUint32(DFD_OFFSET_AT, true)
  if (dfd + TRANSFER_IN_DFD >= bytes.byteLength) return null
  return {
    width: view.getUint32(PIXEL_WIDTH_AT, true),
    height: view.getUint32(PIXEL_HEIGHT_AT, true),
    encoding: encodingOf(
      view.getUint32(SUPERCOMPRESSION_AT, true),
      bytes[dfd + COLOR_MODEL_IN_DFD],
    ),
    transfer: transferOf(bytes[dfd + TRANSFER_IN_DFD]),
  }
}

/** Why a map file breaks #52 acceptance 2; empty when it passes. */
export function ktx2MapProblems(file: string, kind: MapKind, bytes: Uint8Array): string[] {
  const header = readKtx2Header(bytes)
  if (header === null) return [`${file}: is not a KTX2 file`]
  const wanted = MAP_FORMATS[kind]
  const problems: string[] = []
  if (!isAtlasSide(header.width) || !isAtlasSide(header.height)) {
    problems.push(
      `${header.width}x${header.height} must be power-of-two sides up to ${ART_RULES.maxAtlasPx}`,
    )
  }
  if (header.encoding !== wanted.encoding) problems.push(`a ${kind} map must be ${wanted.encoding}`)
  if (header.transfer !== wanted.transfer) problems.push(`a ${kind} map must be ${wanted.transfer}`)
  return problems.map((problem) => `${file}: ${problem}`)
}

function hasKtx2Identifier(bytes: Uint8Array): boolean {
  return bytes.byteLength > DFD_OFFSET_AT && IDENTIFIER.every((byte, at) => bytes[at] === byte)
}

function encodingOf(supercompression: number, colorModel: number): Ktx2Encoding {
  if (colorModel === COLOR_MODEL_UASTC) return 'uastc'
  const isEtc1s = colorModel === COLOR_MODEL_ETC1S && supercompression === SUPERCOMPRESSION_BASIS_LZ
  return isEtc1s ? 'etc1s' : 'other'
}

function transferOf(transfer: number): Ktx2TransferFunction {
  if (transfer === TRANSFER_LINEAR) return 'linear'
  return transfer === TRANSFER_SRGB ? 'srgb' : 'other'
}
