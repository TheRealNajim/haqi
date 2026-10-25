# haqi demo run-through (judge-safe, scripted)

How to run the demo: the sequence below works with zero infra and four live
sources. It ends with an honesty moment — the strongest possible ending —
then shows the proof route. Practise it twice before demo day.

## Boot (before judges sit down)

```bash
cd backend
../.venv/bin/uvicorn app.main:app --port 8000 &   # or python -m
curl -s localhost:8000/health                     # expect {"ok": true, ...}
python smoke_test.py                              # expect 6 PASS, 2 SKIP
```

The SKIP lines are the two sponsor slots (Zetaris, Nemotron). Say it out loud:
"our sponsor route comes from a teammate machine; the product runs without it,
on purpose."

## Beat 1 — the question (30s)

```bash
curl -s "localhost:8000/ask" -H 'Content-Type: application/json' \
  -d '{"question":"can Chidi play football at 4 pm?","lat":6.5244,"lon":3.3792}'
```

Read the reply out loud: the LEVEL, then the reason in one sentence.
Point at `blind_spots`: one live blind list = the honesty feature
is on, not decoration.

## Beat 2 — the why graph (60s)

```bash
curl -s localhost:8000/why/<ledger_id from beat 1> | python3 -m json.tool
```

Narrate: every node is a source that was actually asked, edges carry weights,
stale stations are labelled and down-weighted. This is the "explain why" contract.

## Beat 3 — the honesty moment (45s)

Kill a source live (turn off wifi) and hit /ask again:

```bash
curl -s "localhost:8000/ask" -H 'Content-Type: application/json' \
  -d '{"question":"football at 4 pm?","lat":6.5244,"lon":3.3792}'
```

The verdict degrades to "treat as uncertain" and SAYS WHICH SOURCES IT LOST.
Turn wifi back on, ask again — it self-heals in the same demo.

## Beat 4 — the proof (30s)

```bash
curl -s localhost:8000/proof | python3 -m json.tool
```

Read: every claim names the test file that enforces it. Machine evaluators get
the same body at /api/proof.

## Failure play (if something crashes live)

- 5xx bodies carry `"fallback": true` on the fixture answer — the contract
  held; say so and move on.
- If the port is dead: uvicorn restart takes ~2s.

## What NOT to do

- Never edit code live on stage.
- Never un-flag a fixture answer to look live. That's the one dishonest path.
