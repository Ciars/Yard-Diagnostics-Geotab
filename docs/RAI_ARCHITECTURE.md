# Rai Architecture

## End-to-End Flow

```mermaid
flowchart LR
    A[Dashboard State] --> B[Rai Context Builder]
    C[Expanded Asset Detail] --> B
    B --> D[Rai Panel Composer]
    D --> E[/api/rai/chat]
    E --> F[Validation + CORS + Rate Limit + Concurrency Gate]
    F --> G[Gemini 3.1 Pro Preview]
    G -->|Tool calls| E
    E -->|tool_call contract| D
    D --> H[Client Read-Only Tool Executor]
    H -->|Tool results| E
    E -->|Final answer| D
```

## Components

- Frontend module: `src/features/rai/*`
- Backend endpoint: `functions/index.js` (`raiChat`)
- Shared read-only Geotab guards: `src/features/rai/shared/geotabReadGuards.ts`

### UI Layer

- `Dashboard` adds a clear `Rai` trigger in the map controls area.
- `RaiPanel` is a slide-in overlay:
  - Desktop: right drawer over map.
  - Mobile: bottom full-width sheet.
- Composer supports `send`, `loading`, `cancel`, and `retry`.
- Suggested prompts are context-sensitive.
- Context badges surface active zone/filter/focus status.

### Context Orchestration

`buildRaiContextSnapshot()` composes:
- Global app state:
  - selected zone
  - KPI filter/search/sort
  - expanded vehicle id
- Loaded data summaries:
  - total/visible vehicles
  - critical/silent/charging/dormant counts
  - unrepaired DVIR count
- Focus state:
  - expanded vehicle summary
  - expanded detail snapshot (faults/DVIR/diagnostics/timeline)
- Entity references:
  - zone id
  - full vehicle id references
  - visible vehicle ids

`useAssetHealth()` now publishes expanded row detail snapshots into Rai state for retrieval.

### Tool Contract

Rai tool names:
- `get_loaded_context_snapshot`
- `get_vehicle_detail_by_id`
- `geotab_read_get`

`geotab_read_get` guardrails:
- method hard-locked to `Get`
- allowlist entity types only
- bounded `resultsLimit` (max 250)
- bounded date window (max 31 days)
- sanitized search object (depth/key limits, command-like keys stripped)

Execution model:
- Backend orchestrates tool calls via Gemini function-calling.
- Client executes read-only tools with current Geotab user session.
- Tool results are returned to backend for final response synthesis.

## Security Controls

### Secrets

- Gemini key only in server env (`RAI_GEMINI_API_KEY`).
- No model key in frontend bundle.

### API Security

- strict CORS origin validation (`RAI_ALLOWED_ORIGINS`)
- request size limit (default 64KB)
- request schema validation + normalization
- sanitized tool payloads and context payloads

### Prompt-Injection Defense

System instruction explicitly treats telemetry/comments/labels as untrusted content and forbids policy override from user/content fields.

### Privacy + Logging Hygiene

- logs contain request metadata only
- actor ids hashed (`fnv1a`)
- no raw telemetry/context payload logging

## Resilience + Abuse Protection

- token-bucket per actor (`TokenBucketRateLimiter`)
- per-session + global concurrency caps (`ConcurrencyGate`)
- provider retry/backoff for 429/5xx
- short TTL duplicate cache keyed by conversation tail + context summary

## Prompting Behavior

Rai is constrained to return:
1. Short diagnosis
2. Ranked risks
3. Recommended next actions
4. Confidence + assumptions
5. Data used

## Key Files

- `src/components/Dashboard/Dashboard.tsx`
- `src/features/rai/components/RaiPanel.tsx`
- `src/features/rai/context/raiContextBuilder.ts`
- `src/features/rai/context/expandedDetailSnapshot.ts`
- `src/features/rai/hooks/useRaiController.ts`
- `src/features/rai/tools/clientTools.ts`
- `src/features/rai/shared/geotabReadGuards.ts`
- `functions/index.js`
