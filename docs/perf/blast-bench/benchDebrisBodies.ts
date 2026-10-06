/**
 * #154: what blast debris costs as Rapier bodies (rapier3d-compat 0.14, the game's version), against
 * the game's world shape: one vehicle body, a 3 x 3 halo of trimesh walls. N small dynamic cuboids
 * (0.25 m, 2D-locked like the vehicle) are dropped into a carved crater floor and stepped 120 times
 * at 1/60 s; reports the step time p50/p95/max per N. GPU-only debris costs no physics step at all.
 *   node node_modules/vite-node/vite-node.mjs scripts/benchDebrisBodies.ts
 */
const RAPIER = (await import('@dimforge/rapier3d-compat')).default
await RAPIER.init()
const pct = (xs: number[], q: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))]
const r3 = (n: number) => Number(n.toFixed(3))

function floorWalls(world: RAPIER.World) {
  // A 12 m wide crater floor and two walls, as trimesh quads extruded +-1 m in z (groundHalo's shape).
  const segs = [-6, 0, 6, 0, -6, 0, -6, 8, 6, 0, 6, 8]
  const count = segs.length / 4
  const v = new Float32Array(count * 12)
  const idx = new Uint32Array(count * 6)
  for (let at = 0; at < count; at++) {
    const [ax, ay, bx, by] = segs.slice(at * 4, at * 4 + 4)
    v.set([ax, ay, -1, bx, by, -1, bx, by, 1, ax, ay, 1], at * 12)
    const f = at * 4
    idx.set([f, f + 1, f + 2, f, f + 2, f + 3], at * 6)
  }
  world.createCollider(RAPIER.ColliderDesc.trimesh(v, idx))
}

const out: Record<string, unknown> = {}
for (const n of [0, 50, 100, 200, 400, 800]) {
  const runs: number[] = []
  for (let rep = 0; rep < 3; rep++) {
    const world = new RAPIER.World({ x: 0, y: -12, z: 0 })
    floorWalls(world)
    const vehicle = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 0.5, 0)
        .enabledTranslations(true, true, false)
        .enabledRotations(false, false, true),
    )
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.45, 0.45, 0.45), vehicle)
    for (let i = 0; i < n; i++) {
      const b = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(-5 + (i % 40) * 0.25, 1 + Math.floor(i / 40) * 0.3, 0)
          .enabledTranslations(true, true, false)
          .enabledRotations(false, false, true),
      )
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.125, 0.125, 0.125), b)
    }
    const ms: number[] = []
    for (let s = 0; s < 120; s++) {
      const t = performance.now()
      world.step()
      ms.push(performance.now() - t)
    }
    runs.push(...ms.slice(10))
    world.free()
  }
  out[`n${n}`] = {
    stepP50Ms: r3(pct(runs, 0.5)),
    stepP95Ms: r3(pct(runs, 0.95)),
    stepMaxMs: r3(pct(runs, 1)),
  }
}
console.log(
  JSON.stringify({
    bench: 'debrisBodies',
    load: (await import('node:fs')).readFileSync('/proc/loadavg', 'utf8').trim(),
    ...out,
  }),
)
