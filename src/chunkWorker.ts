/**
 * Composition root of the chunk worker (TD scope c2 on #316, ticket 337): a second realm, so it
 * loads the slices first like every root (their generation hooks and ore, gate and field looks
 * paint the chunks), says it is ready, then answers each job with the chunk's mesh parts, their
 * buffers handed over rather than copied. It generates chunks behind its own cache; the authority
 * on the main thread never reads it.
 */
import { loadFeatures } from './features'
import {
  runChunkMeshJob,
  type ChunkMeshJob,
  type ChunkWorkerReply,
} from './systems/render/chunkMeshJob'
import { buffersOfMeshParts } from './systems/render/chunkMeshParts'

loadFeatures()
self.onmessage = (event: MessageEvent<ChunkMeshJob>) => replyWithMeshParts(event.data)
reply({ kind: 'ready' }, [])

function replyWithMeshParts(job: ChunkMeshJob): void {
  const result = runChunkMeshJob(job)
  // The batch and halo are built on plain ArrayBuffers (`new Float32Array(n)`), never shared ones.
  reply({ kind: 'built', ...result }, buffersOfMeshParts(result.parts) as ArrayBuffer[])
}

function reply(message: ChunkWorkerReply, transfer: ArrayBuffer[]): void {
  self.postMessage(message, { transfer })
}
