#!/usr/bin/env bash
# Source this file: . ./scripts/copilot-otel-env.sh

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${PROJECT_ROOT}/.copilot/telemetry"
export COPILOT_OTEL_ENABLED=true
export COPILOT_OTEL_EXPORTER_TYPE=otlp-http
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://127.0.0.1:27432}"
export OTEL_EXPORTER_OTLP_PROTOCOL="${OTEL_EXPORTER_OTLP_PROTOCOL:-http/protobuf}"
export COPILOT_OTEL_SOURCE_NAME="${COPILOT_OTEL_SOURCE_NAME:-copilot}"
export OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-copilot}"
export OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true
printf 'Copilot native OTel -> %s (%s)\n' "${OTEL_EXPORTER_OTLP_ENDPOINT}" "${OTEL_EXPORTER_OTLP_PROTOCOL}"
