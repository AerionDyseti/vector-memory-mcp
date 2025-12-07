#!/bin/bash
# vector-memory-mcp UserPromptSubmit hook
# Fetches relevant memories and injects them into the conversation context
#
# This hook calls the vector-memory-mcp HTTP API to search for memories
# related to the user's prompt and returns them as additional context.

set -euo pipefail

# Configuration
VECTOR_MEMORY_HTTP_PORT="${VECTOR_MEMORY_HTTP_PORT:-3271}"
VECTOR_MEMORY_HTTP_HOST="${VECTOR_MEMORY_HTTP_HOST:-127.0.0.1}"
VECTOR_MEMORY_URL="http://${VECTOR_MEMORY_HTTP_HOST}:${VECTOR_MEMORY_HTTP_PORT}"

# Read input from stdin
input=$(cat)

# Extract the user's prompt using jq
prompt=$(echo "$input" | jq -r '.prompt // empty')

# If no prompt, exit silently
if [[ -z "$prompt" ]]; then
  echo '{"continue": true}'
  exit 0
fi

# Check if server is available (quick health check)
if ! curl -sf "${VECTOR_MEMORY_URL}/health" > /dev/null 2>&1; then
  # Server not available - continue without memory injection
  echo '{"continue": true}'
  exit 0
fi

# Request relevant context from the memory server
response=$(curl -sf -X POST "${VECTOR_MEMORY_URL}/context" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$prompt" '{query: $q}')" 2>/dev/null) || {
  # Request failed - continue without memory injection
  echo '{"continue": true}'
  exit 0
}

# Extract the context block
context=$(echo "$response" | jq -r '.context // empty')

# If we got context, inject it
if [[ -n "$context" && "$context" != "null" ]]; then
  # Return with additional context
  jq -n --arg ctx "$context" '{
    "continue": true,
    "additionalContext": $ctx
  }'
else
  echo '{"continue": true}'
fi
