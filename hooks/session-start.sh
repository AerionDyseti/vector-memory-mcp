#!/bin/bash
# vector-memory-mcp SessionStart hook
# Resets the memory injection widget counter at the start of a new session

set -euo pipefail

# Configuration
VECTOR_MEMORY_HTTP_PORT="${VECTOR_MEMORY_HTTP_PORT:-3271}"
VECTOR_MEMORY_HTTP_HOST="${VECTOR_MEMORY_HTTP_HOST:-127.0.0.1}"
VECTOR_MEMORY_URL="http://${VECTOR_MEMORY_HTTP_HOST}:${VECTOR_MEMORY_HTTP_PORT}"

# Read input from stdin (required by hook protocol)
input=$(cat)

# Extract the session source
source=$(echo "$input" | jq -r '.source // "startup"')

# Only reset on fresh startup or clear
if [[ "$source" == "startup" || "$source" == "clear" ]]; then
  # Reset the widget counter (fire and forget)
  curl -sf -X POST "${VECTOR_MEMORY_URL}/reset-widget" > /dev/null 2>&1 || true
fi

# Always continue
echo '{"continue": true}'
