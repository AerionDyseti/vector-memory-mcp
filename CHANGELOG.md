# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-01-06

### Added
- **Batch memory operations**: `store_memories`, `update_memories`, `delete_memories`, `get_memories` now accept arrays
- **Handoff system**: `store_handoff` and `get_handoff` for session continuity
- **Session-start hook**: `hooks/session-start.ts` for automatic handoff loading
- **HTTP/SSE transport**: Connect via HTTP for Claude Desktop integration
- **Graceful shutdown**: Proper cleanup on SIGTERM, SIGINT, stdin close
- **Publish tooling**: `/publish` slash command and `scripts/publish.ts`
- **CI workflow**: GitHub Actions for running tests on PRs

### Changed
- Standardized data storage to `.vector-memory/` directory
- Simplified configuration (hard-coded paths, fewer CLI args)

## [0.5.0] - 2026-01-04

### Added
- Proactive memory guidance and project configuration
- Global install support via `bunx`

### Changed
- Updated configuration documentation

## [0.4.0] - 2026-01-03

### Added
- Automatic warmup on install (downloads ML models)
- Fixed installation dependencies for native modules

## [0.3.0] - 2026-01-02

### Added
- Core memory operations (store, search, get, delete)
- LanceDB vector storage
- Local embeddings via @huggingface/transformers
- MCP protocol integration

## [0.2.0] - 2025-12-30

### Added
- Initial MCP server implementation
- Basic project structure

[0.8.0]: https://github.com/AerionDyseti/vector-memory-mcp/compare/v0.5.0...v0.8.0
[0.5.0]: https://github.com/AerionDyseti/vector-memory-mcp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/AerionDyseti/vector-memory-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/AerionDyseti/vector-memory-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/AerionDyseti/vector-memory-mcp/releases/tag/v0.2.0
