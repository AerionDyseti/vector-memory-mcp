# Code Style and Conventions

## TypeScript Configuration
- Target: ES2022
- Module: NodeNext (ES Modules)
- Strict mode enabled
- Source maps enabled

## Naming Conventions
- **Files**: kebab-case (e.g., `memory.service.ts`, `embeddings.service.ts`)
- **Classes**: PascalCase (e.g., `MemoryService`, `MemoryRepository`)
- **Methods/Functions**: camelCase (e.g., `store`, `findById`, `followSupersessionChain`)
- **Variables**: camelCase (e.g., `queryEmbedding`, `fetchLimit`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `DELETED_TOMBSTONE`)
- **Types/Interfaces**: PascalCase (e.g., `Memory`, `MemoryRepository`)

## Import Style
- Use `type` keyword for type-only imports: `import type { Memory } from "../types/memory.js"`
- Include `.js` extension in imports (required for NodeNext module resolution)
- Group imports: external packages first, then internal modules

## Class Structure
- Use constructor injection for dependencies
- Private fields via `private` keyword in constructor
- Async/await for all asynchronous operations
- Return `Promise<T>` for async methods

## Code Patterns
- Repository pattern for database access
- Service layer for business logic
- Handlers for MCP tool requests
- Soft deletion via supersession chain (no hard deletes)

## Type Annotations
- Explicit return types on public methods
- Use `Record<string, unknown>` for metadata objects
- Prefer interfaces over type aliases for object shapes

## No JSDoc Comments
The codebase uses TypeScript types instead of JSDoc comments for documentation.
