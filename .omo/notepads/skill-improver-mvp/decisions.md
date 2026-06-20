

# Decisions - Skill Improver MVP

## Architecture
- Storage: File-based JSON behind Repository interface (future SQLite migration)
- Routing: Keyword-based, case-insensitive, 'general' fallback
- Evaluation: LLM-based with configurable endpoint, retry-once, fallback outcome
- Episode: 1:1 with session for MVP, but separate ID fields for future multi-episode support
- Versioning: All records carry schemaVersion, evaluatorVersion, routerVersion