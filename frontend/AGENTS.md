# frontend/AGENTS.md - you are the FRONTEND agent

Working for the UI lead. You own frontend/* only. You know web dev - this file doesn't teach
you your craft. It pins the decisions already made so you don't relitigate them.

Read first: ../AGENTS.md, ../SPEC.md (Addenda B-E), ../docs/CONTRACTS.md.

## Product decisions that are FINAL (do not redesign)
- Three screens: Ask (entry point), Today, Why? (+ a minimal About page carrying the
  "Icons by Streamline" attribution)
- Chat-style INPUT is fine; chat-style OUTPUT is banned - answers render as structured
  verdict cards (chip + one sentence + window + small print)
- Why? page = node graph from /api/why: node size = weight, gray+dashed = stale,
  tap a node for detail. See fixtures/why.json
- Blind spots always shown in plain words, never hidden
- Pixel-art aesthetic, one sprite sheet, three verdict colors (SPEC Addendum C)
- Target user is 14: acceptance test = a 14-year-old uses it unaided

## Your craft, your calls
Stack, bundler, styling approach, animation, component structure: UI lead's decision.
The only constraint: a FIXTURES switch in one api module so the whole app runs offline
against fixtures/ before the backend exists.

## Git commit rules (explicit, from the coordinator's workflow)
- One logical unit of work per commit, verified first (build/tests green). Never bulk-commit.
- Production files only. NEVER stage: secrets (.env, any *.env except root .env.example),
  planning docs (SPEC.md, DECISIONS.md, QWEN_BRIEF.md, docs/CONTRACTS.md), agent scratch notes.
- Review `git status` + `git diff` before staging. Stage specific paths; never `git add .` blind.
- Commit messages: plain language describing the product change ("Protect flow: verdict chip
  on Today"), no feat:/fix:/docs: prefixes, no "frontend work" labels.
- Never bundle git add + commit + push into one command. main is golden: no direct pushes —
  work on feat/<area>-* branches, push the branch only after tests are green, PR to main.
- Never push without an explicit go-ahead from your human lead; one approved push does not
  authorize future pushes.

## Definition of done (by Oct 21)
All three screens render from fixtures at 360px width, offline. Zero backend dependency.
Report blockers per the format in the root file.

## MESSAGE TO FRONTEND AGENT (from backend lead, Oct 25)

Backend is live and judge-ready. Point the app at it:

1. **Base URL: https://haqi-api.onrender.com** — free-tier Render, keep-warmed.
   Endpoints: `GET /today` (Lagos verdict), `GET /ask?q=...&profile=asthma`
   (returns same Verdict shape), `GET /why/{ledger_id}` (evidence graph),
   `GET /sources/status`, `GET /health`. Full field-by-field contract with
   copy rules: **`API_INTEGRATION.md` at repo root — read that first.**
2. **Wire src/data/ask.ts to the real API.** It is still fixtures-only; that
   was one of the two reasons live data didn't show. Swap `askHaqi` for the
   fetch layer; keep the fixtures import behind the FIXTURES switch you
   already planned — it stays the offline dev mode AND the fallback renderer.
3. **Send your deployed Vercel URL to the backend lead** — it must be added to
   the API's `HAQI_CORS_ORIGINS` in the Render dashboard before the deployed
   app can call it, else browsers block the call. Local dev (vite 5173) is
   already allowed; deployed origins are not yet.
4. **`"fallback": true` in a Verdict = labeled fixture/synthetic data served
   because a live source was unreachable.** Style it as an honest demo-data
   banner per `API_INTEGRATION.md` — never render it as if it were live.
5. **Known honest blind slots (NOT bugs):** Bright Data advisory key is
   pending (their site was down), Zetaris waits on infra recipes, Pollen is
   Europe-only by design (**Lagos is our pilot and gets a disclosed blind**).
   Render the blind-spot notes as disclosure chips, not error toasts.
6. **Win `at Xpm` (future hour) verdicts may arrive with `"aqi": null` and a
   careful level + "come back nearer the time" reason when the plan is >3h
   out — that is the product's honesty promise, not a missing-data bug.**
   Do not retry-loop these; they are final answers.

Ask questions in this file or message the coordinator — backend answers here.
