#!/usr/bin/env node
/* eslint-disable -- archived bench script for docs/perf/blast-frame-budget.md, not product code */
// #154 browser probe: one big carve in the running game (preview build, headless Chrome with
// SwiftShader software GL, the memory soak's own launcher and switches), read only through the
// debug API. Per radius it reloads the game, freezes enemies, drives off the dock pad, then carves a disc
// centred half a radius below the vehicle, and:
//  - memory before/after (forced GC): usedJSHeapSize, renderer geometries/textures, Rapier
//    colliders and WASM bytes (`ui.getRendererMemory`, `getPhysicsStats`, #119 seams);
//  - the wall time of `carveCircle` itself (authority apply + store), in the page;
//  - per animation frame for 2 s before and 4 s after: the frame interval and the terrain sync's
//    own milliseconds (`renderPresence.terrainMs`, the chunk mesh rebuild), the drawn chunks and
//    the live ground colliders;
//  - where the vehicle is 6 s later: the disc is centred R/2 below it (the soft rim leaves density
//    over the iso level beyond ~0.87 R), so it stands inside the crater and must land on its floor;
//    falling through would be a drop past ~1.4 R and still growing.
// SwiftShader frame intervals are software rendering on a shared CPU: trends only, never a GPU budget.
//   node scripts/blastProbe.mjs --radii 4,8,13,21,32 --runs 3 --out DIR [--port 4397] [--browser PATH]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isGameMemoryReadable, readGameMemory } from './soak/soakPage.mjs'
import { openBrowserTarget } from './soak/soakTarget.mjs'

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}
const RADII = arg('radii', '4,8,13,21,32').split(',').map(Number)
const RUNS = Number(arg('runs', '3'))
const OUT = resolve(arg('out', 'test-results/blast-probe'))
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
mkdirSync(OUT, { recursive: true })

async function gcSample(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  await page.evaluate(() => globalThis.gc?.())
  await cdp.send('HeapProfiler.collectGarbage')
  return page.evaluate(readGameMemory)
}

/** Runs inside the page: records frames for `beforeMs`, carves, records for `afterMs`. */
async function blastInPage({ radiusMm, beforeMs, afterMs }) {
  const debug = globalThis.steampunkDebug
  const frames = []
  let carveAt = null
  let carveMs = null
  let carveResult = null
  const state0 = debug.snapshot().snapshot.state
  const pose0 = Object.values(state0.players)[0].vehicle.pose
  await new Promise((done) => {
    const start = performance.now()
    let last = start
    const tick = (now) => {
      const stats = debug.ui.getRenderStats().stats
      frames.push({
        t: now - start,
        dt: now - last,
        terrainMs: stats.terrainMs,
        drawnChunks: stats.drawnChunks,
        groundColliders: stats.groundColliders,
        drawCalls: stats.drawCalls,
      })
      last = now
      if (carveAt === null && now - start >= beforeMs) {
        carveAt = now - start
        const t0 = performance.now()
        carveResult = debug.carveCircle(pose0.x, pose0.y - Math.round(radiusMm / 2), radiusMm)
        carveMs = performance.now() - t0
      }
      if (now - start < beforeMs + afterMs) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  })
  const state1 = debug.snapshot().snapshot.state
  const pose1 = Object.values(state1.players)[0].vehicle.pose
  return {
    carveAt,
    carveMs,
    carveOk: carveResult?.ok ?? false,
    problems: carveResult?.problems ?? [],
    frames,
    pose0,
    pose1,
  }
}

const target = await openBrowserTarget({
  dist: 'dist',
  port: Number(arg('port', '4397')),
  browserPath: arg('browser', '/usr/bin/google-chrome'),
})
const { page } = target
const cdp = await page.context().newCDPSession(page)
await cdp.send('HeapProfiler.enable')
const results = []
try {
  for (let run = 1; run <= RUNS; run++) {
    for (let i = 0; i < RADII.length; i++) {
      const radius = RADII[(i + run - 1) % RADII.length]
      await target.startGame()
      await page.waitForFunction(isGameMemoryReadable, null, { timeout: 120_000 })
      await sleep(4_000)
      const setup = await page.evaluate(() => {
        const d = globalThis.steampunkDebug
        return [d.freezeEnemies(true), d.setEnergy('150'), d.setHull('100')].flatMap((r) =>
          r.ok ? [] : r.problems,
        )
      })
      // Off the dock pad (never carved), as the soak's first leg drives: then settle.
      await page.evaluate(() => globalThis.steampunkDebug.input.press('aim_right'))
      await sleep(6_000)
      await page.evaluate(() => globalThis.steampunkDebug.input.release('aim_right'))
      await sleep(3_000)
      const loadBefore = (await import('node:fs')).readFileSync('/proc/loadavg', 'utf8').trim()
      const memBefore = await gcSample(page, cdp)
      const blast = await page.evaluate(blastInPage, {
        radiusMm: Math.round(radius * 1000),
        beforeMs: 2_000,
        afterMs: 6_000,
      })
      await sleep(1_000)
      const memAfter = await gcSample(page, cdp)
      const loadAfter = (await import('node:fs')).readFileSync('/proc/loadavg', 'utf8').trim()
      const before = blast.frames.filter((f) => f.t < blast.carveAt)
      const after = blast.frames.filter((f) => f.t >= blast.carveAt)
      const pct = (xs, q) => {
        const s = [...xs].sort((a, b) => a - b)
        return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null
      }
      const row = {
        run,
        radius,
        setup,
        loadBefore,
        loadAfter,
        carveMs: blast.carveMs,
        carveOk: blast.carveOk,
        problems: blast.problems,
        framesBefore: before.length,
        framesAfter: after.length,
        frameP50BeforeMs: pct(
          before.map((f) => f.dt),
          0.5,
        ),
        frameMaxBeforeMs: pct(
          before.map((f) => f.dt),
          1,
        ),
        frameP50AfterMs: pct(
          after.map((f) => f.dt),
          0.5,
        ),
        frameMaxAfterMs: pct(
          after.map((f) => f.dt),
          1,
        ),
        firstFrameAfterMs: after[1]?.dt ?? null,
        terrainMaxBeforeMs: pct(
          before.map((f) => f.terrainMs),
          1,
        ),
        terrainMaxAfterMs: pct(
          after.map((f) => f.terrainMs),
          1,
        ),
        terrainRebuildFrames: after.filter((f) => f.terrainMs > 0.5).length,
        terrainAfterSeries: after.slice(0, 16).map((f) => Number(f.terrainMs.toFixed(2))),
        drawnChunksBefore: before.at(-1)?.drawnChunks,
        drawnChunksAfter: after.at(-1)?.drawnChunks,
        collidersBefore: before.at(-1)?.groundColliders,
        collidersAfter: after.at(-1)?.groundColliders,
        drawCallsBefore: before.at(-1)?.drawCalls,
        drawCallsAfter: after.at(-1)?.drawCalls,
        pose0: blast.pose0,
        pose1: blast.pose1,
        dropM: (blast.pose0.y - blast.pose1.y) / 1000,
        memBefore,
        memAfter,
      }
      results.push(row)
      console.log(
        JSON.stringify({
          run,
          radius,
          carveMs: row.carveMs?.toFixed(1),
          terrainMaxAfterMs: row.terrainMaxAfterMs?.toFixed(1),
          rebuildFrames: row.terrainRebuildFrames,
          frameMaxAfterMs: row.frameMaxAfterMs?.toFixed(0),
          frameP50BeforeMs: row.frameP50BeforeMs?.toFixed(0),
          dropM: row.dropM,
          heapMB: ((memAfter.usedJSHeapSize - memBefore.usedJSHeapSize) / 1048576).toFixed(2),
          geo: `${memBefore.geometries}->${memAfter.geometries}`,
          tex: `${memBefore.textures}->${memAfter.textures}`,
          coll: `${memBefore.rapierColliders}->${memAfter.rapierColliders}`,
          wasm: `${memBefore.wasmBytes}->${memAfter.wasmBytes}`,
          load: loadBefore,
        }),
      )
      writeFileSync(join(OUT, 'probe.json'), JSON.stringify(results, null, 1))
    }
  }
} finally {
  await target.close()
}
