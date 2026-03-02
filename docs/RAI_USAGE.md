# Rai Usage

## Opening Rai

- In the map panel, click the `Rai` control at top-right.
- Rai opens as a slide-in panel over the map.

## What Rai Uses Automatically

- Current selected zone
- Active KPI filter/search/sort
- Visible vehicle context
- Expanded row focus + deep detail (faults, DVIR, diagnostics, timeline)
- Optional extra read-only Geotab calls via guarded tools

## Example Prompts

- "What are my top dispatch risks in this yard right now?"
- "Rank the vehicles most likely to fail dispatch in the next shift."
- "For the focused vehicle, what should maintenance do first and why?"
- "What silent/offline units need immediate follow-up?"
- "Give me a shift handover brief with actions by priority."

## Response Shape

Rai responds with:
1. Short diagnosis
2. Ranked risks
3. Recommended next actions
4. Confidence + assumptions
5. Data used / tool context

## Safety Model

- Rai cannot execute Geotab write actions.
- `geotab_read_get` is read-only and entity-limited.
- If provider rate-limits, Rai returns a fallback prompt to retry.

## Operator Tips

- Expand a vehicle row first for deeper, vehicle-specific guidance.
- Use concise prompts with explicit time horizon (e.g. "next 4 hours").
- Retry button replays your latest user prompt after transient failures.
