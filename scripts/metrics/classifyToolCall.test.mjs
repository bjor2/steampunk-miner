import { describe, expect, it } from 'vitest'
import { classifyShellCommand, classifyToolCall } from './classifyToolCall.mjs'

function bash(command, extra = {}) {
  return classifyToolCall('Bash', { command, ...extra })
}

describe('ticket phases: tool call classifier', () => {
  it('counts reading files, searching and issue lookups as context gathering', () => {
    expect(classifyToolCall('Read', { file_path: '/repo/src/a.ts' })).toBe('context')
    expect(classifyToolCall('Grep', { pattern: 'lava' })).toBe('context')
    expect(classifyToolCall('Glob', { pattern: '**/*.ts' })).toBe('context')
    expect(classifyToolCall('WebFetch', { url: 'https://example.com' })).toBe('context')
    expect(classifyToolCall('Skill', { skill: 'osilion-dev-tsr3f' })).toBe('context')
    expect(bash('gh issue view 133 --comments')).toBe('context')
    expect(bash('cd /repo && git log --oneline -5; git show HEAD --stat')).toBe('context')
    expect(bash("sed -n 1,140p src/logging/sliceRunLog.ts; grep -n 'lava' src/a.ts")).toBe(
      'context',
    )
    expect(bash('for n in 113 96; do gh issue view $n --json title,body; done')).toBe('context')
  })

  it('counts a read-only python look at files as context, not developing', () => {
    expect(bash("python3 - <<'EOF'\nimport json\nprint(json.load(open('a.json'))['x'])\nEOF")).toBe(
      'context',
    )
  })

  it('counts plans and todo lists as planning', () => {
    expect(classifyToolCall('TodoWrite', { todos: [] })).toBe('planning')
    expect(classifyToolCall('ExitPlanMode', { plan: 'x' })).toBe('planning')
    expect(classifyToolCall('Agent', { subagent_type: 'Plan', prompt: 'plan it' })).toBe('planning')
  })

  it('counts file edits, commits and file-writing scripts as developing', () => {
    expect(classifyToolCall('Edit', { file_path: 'src/a.ts' })).toBe('developing')
    expect(classifyToolCall('Write', { file_path: 'src/a.ts' })).toBe('developing')
    expect(classifyToolCall('MultiEdit', { file_path: 'src/a.ts' })).toBe('developing')
    expect(classifyToolCall('NotebookEdit', { notebook_path: 'a.ipynb' })).toBe('developing')
    expect(bash('git add src/a.ts && git commit -m "Run vitest less often (#1)"')).toBe(
      'developing',
    )
    expect(
      bash("python3 - <<'EOF'\np='src/a.ts'\ns=open(p).read()\nopen(p,'w').write(s)\nEOF"),
    ).toBe('developing')
    expect(bash("sed -i 's/a/b/' src/a.ts")).toBe('developing')
    expect(bash("cat > src/a.ts <<'EOF'\nexport const a = 1\nEOF")).toBe('developing')
    expect(bash('npm run art:export -- platform-bay')).toBe('developing')
  })

  it('counts tests, checks, benches, sims and waiting on them as testing', () => {
    expect(bash('npm test 2>&1 | tail -5')).toBe('testing')
    expect(bash('timeout 600 npx vitest run src/systems/bot 2>&1 | grep -E "Tests"')).toBe(
      'testing',
    )
    expect(bash('npm run typecheck && npm run lint && npm run format:check')).toBe('testing')
    expect(bash('npx prettier --write scripts/metrics')).toBe('testing')
    expect(bash('npm run build > /tmp/build.log 2>&1; echo build=$?')).toBe('testing')
    expect(bash('npm run balance:report > /tmp/report.txt 2>&1')).toBe('testing')
    expect(bash('SEED=1 npx vite-node test-results/p131/analyze.ts base 1 10')).toBe('testing')
    expect(bash('timeout 900 npx playwright test e2e/browser/smoke.spec.ts')).toBe('testing')
    expect(
      bash('until grep -q done /tmp/p130/run.log; do sleep 20; done; cat /tmp/p130/run.log'),
    ).toBe('testing')
    expect(bash('npx vite preview --port 4196 --strictPort > /tmp/preview.log 2>&1')).toBe(
      'testing',
    )
    expect(bash('test-results/e102/pair.sh 2')).toBe('testing')
    expect(classifyToolCall('Monitor', { command: 'tail -f x' })).toBe('testing')
    expect(classifyToolCall('ScheduleWakeup', { delaySeconds: 600 })).toBe('testing')
  })

  it('counts rebases, pushes and closing the issue as landing', () => {
    expect(bash('git fetch origin && git rebase origin/main')).toBe('landing')
    expect(bash('gh issue comment 134 --body "npm test green"')).toBe('landing')
    expect(bash('gh issue edit 134 --remove-label in-progress')).toBe('landing')
    expect(bash('gh issue close 134')).toBe('landing')
  })

  it('reads a commit message or issue comment body as text, never as a command', () => {
    expect(bash('git commit -m "npm test and git push"')).toBe('developing')
    expect(classifyShellCommand('gh issue comment 1 --body "sed -i done; npm run build"')).toBe(
      'landing',
    )
  })

  it('puts a tool or command no rule knows in other', () => {
    expect(classifyToolCall('SomeNewTool', {})).toBe('other')
    expect(bash('blargh --frobnicate')).toBe('other')
    expect(bash('')).toBe('other')
  })
})
