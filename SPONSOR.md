# haqi — Sponsor Integration Write-Up

The one-page submission requirement: a clear explanation of how Zetaris and
Meterless were integrated, where NVIDIA technology contributes, and what was
unique about our use of the sponsors.

## Zetaris — the structured-data lane (integration is live in the deployed API)

Zetaris runs as the SQL layer of haqi's agent loop, not as a managed tab we point
at:

1. **Recipes, not web UI.** The infra host registers a Lightning recipe (
   `haqi_views.air_quality_readings`) whose one row means
   `[source_id, raw_value, unit, distance_km, observed_at]`. Our backend speaks
   only that contract (`backend/app/adapters/zetaris.py::_sql_for()`).
2. **Agent-loop membership, not an if-branch in the shell.** `_adapters_for()`
   appends `ZetarisAdapter` to the same `investigate()` fan-out OpenAQ/Weather/
   FIRMS use — so the sponsor view is gathered, weighted, stale-scored, and
   consensus-tested identically to every other source. A down tunnel degrades to
   an honest gap (a 10s REST timeout and a disclosed row in `/sources/status`
   that flips `reachable:false`), never an exception the user must interpret.
3. **Tolerating the sponsor's own data.** The adapter quarantines malformed view
   rows visibly at weight 0 instead of discarding them, and unit-group consensus
   refuses to mix µg/m³ with AQI-scale readings (the first draft silently dropped
   the quarantined rows — our own test caught it).

## Meterless Nightshift — the power lane (integration shipped + tested; armed the moment the tunnel is up)

Meterless is used for what a demo usually fakes with a "confidence" spinner: the
**why** narration.

- `narrate_why()` (backend/agent/llm.py) posts the **ledger only** — the exact
  nodes/edges graph `/why/{id}` renders — to Nightshift's OpenAI-compatible
  endpoint. System prompt: "Use ONLY the evidence listed... no new numbers...
  If a reading was stale or a source was blind, say so." The model may add zero
  facts.
- The lane is env-gated (all three `METERLESS_*` values or none). Missing env =
  the deterministic graph ships without the `story` field. Any failure = same
  degradation. **The narrated story can never invent evidence, because it is
  never the evidence chain's source — the ledger is.**
- The lane is shipped and pinned by tests (`backend/tests/
  test_meterless_narration.py`); it arms the moment Nightshift's backend host
  reports reachable (weights download paused on the infra PC; demo-day plan
  re-arms it).

## NVIDIA Nemotron — the parse lane (live in the deployed API)

`parse_question()` sends kid questions to
`nvidia/nemotron-3.5-bolt-e4b` on NVIDIA's hosted API. What Nemotron adds is the
colloquial layer ("football at 9", "can I cycle in 2 hours") mapped into
`{activity, time_hh, time_desc}` — a fast structured lane measured at ~1.6 s.

What we deliberately do NOT let Nemotron do: author the verdict, or decode time.
The verdict reason is deterministic; the time facts are regex/offset-found first
(`_time_floor()`), and the model's time guess is only accepted when it cannot be
contradicted. This is the split the in-kind NVIDIA prize ("best use of Nemotron")
is about: right model, right lane, safety facts never outsourced.

## What is unique here

- **Sponsor tech handles trust, not features.** Two vendors' runtimes each own a
  lane in *one agent loop* with equal failure semantics — a demo usually wires a
  sponsor into a slide; our sponsor adapters fail, disclose, and recover under
  the same contract the rest of the app fails.
- **The narrated "why" is provably grounded.** A judge can diff `/why/{id}`'s
  graph against the model's story and find no invented number — a property we
  are happy to have checked.
- **We treated "integrate Zetaris and Meterless" as data architecture**, not
  sponsor checkboxes: recipes give the agent truth in tables; the narration
  lane's prompt and harness let the LLM auditably *tell* that truth without
  being a source of new truth.

## Development tools

Cursor was a teammate dev workbench (frontend). Backend + infra were
agent-driven sessions (interactive CLI agents) with the human as coordinator;
the whole repository's truth flows from `backend/tests` and the tool-checked
`/proof` self-audit route.
