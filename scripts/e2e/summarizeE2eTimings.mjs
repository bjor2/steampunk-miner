#!/usr/bin/env node
// Prints a Playwright JSON report's phase and per-spec times as Markdown (#190).
//
//   npm run test:e2e:timings                       e2e-report/results.json (written on CI=1 runs)
//   npm run test:e2e:timings -- <results.json>     another report
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { e2eTimingsOf, formatE2eTimings } from './e2eTimings.mjs'

const DEFAULT_REPORT = 'e2e-report/results.json'

const report = JSON.parse(readFileSync(process.argv[2] ?? DEFAULT_REPORT, 'utf8'))
console.log(formatE2eTimings(e2eTimingsOf(report)))
