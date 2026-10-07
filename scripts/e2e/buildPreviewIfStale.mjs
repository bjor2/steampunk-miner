#!/usr/bin/env node
// The e2e webServer's build step (#190): runs `npm run build` unless dist/ is newer than every
// build input, so a run right after a build (the box Tester's order) starts the preview at once.
// The log line says which, and why.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILD_INPUTS, newestOf, previewBuildChoice } from './previewBuild.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const BUILT_INDEX = join(REPO_ROOT, 'dist', 'index.html')

function readBuiltAtMs() {
  return existsSync(BUILT_INDEX) ? statSync(BUILT_INDEX).mtimeMs : undefined
}

function filesOfInput(input) {
  const path = join(REPO_ROOT, input)
  if (!statSync(path).isDirectory()) return [input]
  return readdirSync(path, { recursive: true }).map((entry) => join(input, String(entry)))
}

function readNewestInput() {
  const files = BUILD_INPUTS.filter((input) => existsSync(join(REPO_ROOT, input))).flatMap(
    filesOfInput,
  )
  return newestOf(files.map((path) => ({ path, mtimeMs: statSync(join(REPO_ROOT, path)).mtimeMs })))
}

function main() {
  const choice = previewBuildChoice(readBuiltAtMs(), readNewestInput())
  console.log(
    `e2e preview: ${choice.isBuildNeeded ? 'building' : 'reusing dist/'} (${choice.reason})`,
  )
  if (choice.isBuildNeeded)
    execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' })
}

main()
