#!/usr/bin/env bash
# Source this file to use Copilot's native all-signal JSONL exporter.
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OTEL_DIR="${PROJECT_ROOT}/.copilot/telemetry"
mkdir -p "${OTEL_DIR}"
export COPILOT_OTEL_ENABLED=true
export COPILOT_OTEL_EXPORTER_TYPE=file
export COPILOT_OTEL_FILE_EXPORTER_PATH="${COPILOT_OTEL_FILE_EXPORTER_PATH:-${OTEL_DIR}/native-otel-$(date +%Y%m%d-%H%M%S).jsonl}"
export OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT="${OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT:-false}"
printf 'Copilot native OTel JSONL -> %s\n' "${COPILOT_OTEL_FILE_EXPORTER_PATH}"
