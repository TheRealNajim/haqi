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
