// Which phase category a Claude Code tool call's time belongs to (#134). Pure: a tool name and its
// input in, a category id out. The rules are the ticket's table: reading is context, editing and
// committing is developing, running checks (and waiting on a background run) is testing, rebasing,
// pushing and closing is landing. A call no rule knows is `other`; when `other` grows, add a rule.

const TOOL_CATEGORIES = {
  Read: 'context',
  Grep: 'context',
  Glob: 'context',
  LS: 'context',
  WebFetch: 'context',
  WebSearch: 'context',
  Skill: 'context',
  ToolSearch: 'context',
  ListAgents: 'context',
  ListMcpResourcesTool: 'context',
  ReadMcpResourceTool: 'context',
  ReadMcpResourceDirTool: 'context',
  TodoWrite: 'planning',
  TaskCreate: 'planning',
  TaskUpdate: 'planning',
  TaskList: 'planning',
  EnterPlanMode: 'planning',
  ExitPlanMode: 'planning',
  Edit: 'developing',
  Write: 'developing',
  MultiEdit: 'developing',
  NotebookEdit: 'developing',
  // Waiting on a background run: in the build loop those are tests, sims, benches and gates.
  Monitor: 'testing',
  ScheduleWakeup: 'testing',
  TaskOutput: 'testing',
  BashOutput: 'testing',
  TaskStop: 'testing',
  KillShell: 'testing',
}

// The first category in this order that any part of a command matches wins: in a chain the
// slowest step (a test run, a rebase) is where the call's time went.
const SHELL_RULES = [
  {
    category: 'testing',
    pattern:
      /\b(?:vitest|playwright|tsc|eslint|prettier|vite-node|sleep|until|kill|pkill|nohup)\b|\bnpm (?:run )?(?:test|typecheck|lint|format|build|bench|soak|balance|golden|perf:record|preview)\b|\bvite (?:preview|build)\b|\/tasks\/\S+\.output|\bcurl\b[^;|&]*localhost|(?:^|\s)(?:\.\/)?test-results\/\S+\.sh\b/,
  },
  {
    category: 'landing',
    pattern:
      /\bgit (?:-C \S+ )?(?:rebase|push|fetch|pull|cherry-pick|merge(?!-))\b|\bgh (?:issue (?:close|comment|edit|reopen)|pr)\b/,
  },
  {
    category: 'developing',
    pattern:
      /\bsed -i|\b(?:cp|mv|mkdir|rm|touch|patch|blender|toktx)\b|\bart:export\b|\bgit (?:-C \S+ )?(?:add|commit|mv|rm|restore|checkout|switch|stash|apply|reset)\b|(?:^|[^0-9&>])>>?\s*(?!&|\/tmp\/|\/dev\/|test-results\/)["']?[\w.$/-]/m,
  },
  {
    category: 'context',
    pattern:
      /\b(?:cat|sed|grep|egrep|rg|ls|head|tail|wc|find|jq|awk|sort|uniq|diff|cut|tr|echo|printf|which|file|stat|du|tree|python3?|node|gh|git|curl|uptime|nproc|ps|pgrep|date|sha256sum|md5sum|comm|realpath|readlink|basename|dirname|pwd|env|free|df|xxd|od|column|seq|less)\b/,
  },
]

const HEREDOC_OPENER = /<<-?\s*(['"]?)([A-Za-z_][\w]*)\1/
// A heredoc body that writes a file: python's open(..., 'w') / .write(...), node's writeFileSync.
const FILE_WRITING_BODY = /\bopen\([^)]*['"][wa]b?['"]|\.write(?:_text)?\(|\bwriteFileSync\b/
// The free text after a commit or comment flag is a message, never a command.
const MESSAGE_ARGUMENT =
  /(?:\s-m|--message|--body|\s-b|--title|\s-t)\s+(?:"(?:[^"\\]|\\.)*"|'[^']*')/g

/** The command with each heredoc body taken out, and the bodies on their own. */
function splitHeredocs(command) {
  const shell = []
  const bodies = []
  let delimiter = null
  let body = []
  for (const line of command.split('\n')) {
    if (delimiter !== null) {
      if (line.trim() === delimiter) {
        bodies.push(body.join('\n'))
        delimiter = null
        body = []
      } else body.push(line)
      continue
    }
    shell.push(line)
    const opener = HEREDOC_OPENER.exec(line)
    if (opener) delimiter = opener[2]
  }
  if (delimiter !== null) bodies.push(body.join('\n'))
  return { shell: shell.join('\n'), bodies }
}

function withoutMessages(shell) {
  return shell.replace(MESSAGE_ARGUMENT, ' ')
}

function categoriesOfShellText(shell) {
  return SHELL_RULES.filter((rule) => rule.pattern.test(shell)).map((rule) => rule.category)
}

function isFileWritingBody(body) {
  return FILE_WRITING_BODY.test(body)
}

function firstByRulePriority(categories) {
  return SHELL_RULES.find((rule) => categories.includes(rule.category))?.category ?? 'other'
}

/** The category of one shell command line (a Bash call's `command`). */
export function classifyShellCommand(command) {
  const { shell, bodies } = splitHeredocs(command)
  const categories = categoriesOfShellText(withoutMessages(shell))
  if (bodies.some(isFileWritingBody)) categories.push('developing')
  return firstByRulePriority(categories)
}

function classifySubagent(input) {
  return input?.subagent_type === 'Plan' ? 'planning' : 'context'
}

function classifyMcpTool(name) {
  if (name.startsWith('mcp__blender__')) return 'developing'
  return /__(?:read|query|get|list|search|guide)/.test(name) ? 'context' : 'other'
}

/** The category of one tool call: `name` is the transcript's tool name, `input` its input. */
export function classifyToolCall(name, input) {
  if (name === 'Bash') return classifyShellCommand(String(input?.command ?? ''))
  if (name === 'Agent' || name === 'Task') return classifySubagent(input)
  if (name.startsWith('mcp__')) return classifyMcpTool(name)
  return TOOL_CATEGORIES[name] ?? 'other'
}
