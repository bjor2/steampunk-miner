# Repository instructions

Read [CLAUDE.md](CLAUDE.md) for this repository's engineering guidelines. It is binding for every
agent and session.

**Git, always:** commit often (one commit per green step, staged by path, message says why).
**Never push unless the user asked for it in this session; never force-push.**

Before writing or running any test, read and follow
[docs/TESTING_INSTRUCTIONS.md](docs/TESTING_INSTRUCTIONS.md).

Code style: [docs/standards/REFERENCE.md](docs/standards/REFERENCE.md) and
[docs/standards/CHECKLIST.md](docs/standards/CHECKLIST.md) (the `osilion-dev-tsr3f` skill).
The game's design is [docs/design.md](docs/design.md); planning lives in this repo's GitHub issues.

**Automated loops:** report what you are doing on the status dashboard
(https://bjor2.github.io/steampunk-miner/status/) with one line:
`scripts/status/loop-status.sh <loop> <working|idle|paused|blocked> [--issue N] [--slot S] [--note "text"]`
— see [docs/loop-status.md](docs/loop-status.md).

**Features:** when you ship or plan a player-facing feature, update
[docs/features/features.json](docs/features/features.json) (shown at
https://bjor2.github.io/steampunk-miner/status/#features) — see
[docs/features/README.md](docs/features/README.md).
