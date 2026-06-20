# Skill Improver

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文](README.md) | [English](README_EN.md)

OpenCode plugin that automatically learns from sessions and improves Skill definitions.

## Agent One-Click Setup

> Paste this prompt into your OpenCode agent to set up Skill Improver instantly:

```
Clone https://github.com/user/skill-improver into ~/.opencode/plugins/skill-improver,
copy config/llm.json.example to config/llm.json, fill in my API key,
add my current skill to config/monitored-skills.json, and start watching this session.
```

## Quick Start

```bash
# 1. Clone the repo
git clone <repo-url>
cd skill-improver

# 2. Configure LLM
cp config/llm.json.example config/llm.json
# Edit config/llm.json and fill in your API key

# 3. Configure monitored Skills
# Create config/monitored-skills.json
echo '{"skills": ["your-skill-name"]}' > config/monitored-skills.json

# 4. Start OpenCode
# Launch an OpenCode session in the project directory

# 5. Start monitoring
# Tell the AI: "Monitor this session"

# 6. Chat normally
# The plugin analyzes in the background and generates improvement suggestions
```

## Configuration

### config/llm.json

LLM API configuration:

```json
{
  "provider": "openai",
  "model": "deepseek-v4-flash",
  "apiKey": "sk-xxx",
  "baseUrl": "https://api.openai.com/v1"
}
```

Supports `openai` and `anthropic` providers. Use the optional `fallback` field to configure a backup model.

### config/monitored-skills.json

List of Skills to monitor:

```json
{
  "skills": ["math-tutor", "docker-skill"]
}
```

### config/params.json

Tuning parameters (optional).

## Architecture

```
User Session
    ↓
Session Monitor (listens for session.idle events)
    ↓
Episode Extractor (extracts incremental messages)
    ↓
Skill Router (matches target Skill)
    ↓
Outcome Evaluator (LLM scores success/failure/novelty)
    ↓
Observation Store (persists observation records)
    ↓
Consolidator (merges and deduplicates rules)
    ↓
Skill Candidate Update (generates candidate updates)
    ↓
Regression Eval (regression testing)
    ↓
Review Session (human approval)
    ↓
Commit / Revert
```

## How It Works

1. **Session Listening**: The plugin listens for `session.idle` events to detect when a session ends.
2. **Message Extraction**: Incrementally extracts new messages to avoid reprocessing.
3. **Skill Routing**: Matches trigger words in message content to find the target Skill.
4. **LLM Evaluation**: Calls an LLM to analyze session quality, outputting success/failure/novelty scores.
5. **Observation Storage**: Persists evaluation results as Observation records.
6. **Rule Consolidation**: Once observations reach a threshold, merges and deduplicates them into candidate rules.
7. **Candidate Update**: The LLM integrates candidate rules into the existing SKILL.md to produce a new version.
8. **Regression Testing**: Compares old and new version scores to ensure quality doesn't degrade.
9. **Human Approval**: Creates a Review session for the user to accept or reject changes.

## Plugin Tools

| Tool | Description |
|------|-------------|
| `skill_improver_watch` | Start monitoring the current session |
| `skill_improver_unwatch` | Stop monitoring the current session |
| `skill_improver_approve` | Approve a Skill improvement proposal |
| `skill_improver_reject` | Reject a Skill improvement proposal |

## Directory Structure

```
skill-improver/
├── config/
│   ├── llm.json              # LLM configuration
│   ├── monitored-skills.json # Monitored skills list
│   └── params.json           # Tuning parameters
├── data/
│   ├── observations/         # Observation records
│   ├── candidates/           # Candidate updates
│   ├── reviews/              # Review records
│   └── debug.log             # Debug log
├── .opencode/
│   ├── plugins/              # Plugin source code
│   └── skills/               # Skill definitions
└── package.json
```

## License

MIT
