/**
 * Rapier's WASM linear memory (#119), for the debug API's `getPhysicsStats().wasmBytes`.
 * rapier3d-compat 0.14 keeps its wasm-bindgen exports private (its `init()` returns nothing), so the
 * one way to its `WebAssembly.Memory` is to see the instance being made: `watchRapierWasmMemory`
 * wraps `WebAssembly.instantiate`, which the compat build calls with its inlined bytes (never
 * `instantiateStreaming`), and keeps the memory of the instance that exports Rapier's rigid-body
 * set. Installed once, by debug runs only, before the physics world loads Rapier.
 */

/** An export only Rapier's module has (rapier3d-compat 0.14 `rapier_wasm3d`). */
const RAPIER_EXPORT = 'rawrigidbodyset_new'

const seen: { memory: WebAssembly.Memory | null; isWatching: boolean } = {
  memory: null,
  isWatching: false,
}

export function watchRapierWasmMemory(): void {
  if (seen.isWatching) return
  seen.isWatching = true
  const instantiate = WebAssembly.instantiate
  async function instantiateWatched(
    source: BufferSource | WebAssembly.Module,
    imports?: WebAssembly.Imports,
  ) {
    if (source instanceof WebAssembly.Module)
      return keptInstance(await instantiate(source, imports))
    const made = await instantiate(source, imports)
    keptInstance(made.instance)
    return made
  }
  // One wrapper answers both overloads, which a single function type cannot declare.
  WebAssembly.instantiate = instantiateWatched as typeof WebAssembly.instantiate
}

/** The memory's size now (it only grows), or null when Rapier loaded unwatched. */
export function rapierWasmBytes(): number | null {
  return seen.memory?.buffer.byteLength ?? null
}

/** Keeps the instance's memory when the instance is Rapier's. */
function keptInstance(instance: WebAssembly.Instance): WebAssembly.Instance {
  const { memory } = instance.exports
  if (RAPIER_EXPORT in instance.exports && memory instanceof WebAssembly.Memory)
    seen.memory = memory
  return instance
}
