# infra/AGENTS.md - you are the INFRA agent

Working for the infra lead. You own infra/* plus root .env.example and any root
docker-compose.yml. You know Docker and ops - this file doesn't teach you your craft.
It pins what's mandatory and what's shared.

Read first: ../AGENTS.md, ../SPEC.md (Addendum A + E), ../docs/CONTRACTS.md.

## Hard requirements (eligibility, not preference)
- Zetaris platform AND Meterless must be RUNNING during the event - on the infra lead's PC
  (Docker Desktop, 8GB/4CPU). verify.sh 9/9 and the sample query working = your gate.
- Product runs on NVIDIA Nemotron via ONE route: Meterless credit OR build.nvidia.com key.
  All three MODEL_* settings from the same route. Mixing routes is the #1 failure.

## What the rest of the team needs from you (deadlines)
- By Oct 19: Zetaris + Meterless up; .env.example complete (every CONTRACTS.md variable);
  team GitHub repo created (private), all three leads invited
- By Oct 20: smoke_test.py shows 3x PASS (backend lead runs it; you provide the .env values)
- Keep docs/CONTRACTS.md ports table truthful - agents route around you using it

## Your craft, your calls
How you run Docker, WSL vs native, VM vs bare metal (if the PC falls short), Zetaris layout:
infra lead's decision. The only constraint: document every manual step in infra/ so the
backend agent can repeat it blind.

## Git commit rules (explicit, from the coordinator's workflow)
- One logical unit of work per commit, verified first (build/tests green). Never bulk-commit.
- Production files only. NEVER stage: secrets (.env, any *.env except root .env.example),
  planning docs (SPEC.md, DECISIONS.md, QWEN_BRIEF.md, docs/CONTRACTS.md), agent scratch notes.
- Review `git status` + `git diff` before staging. Stage specific paths; never `git add .` blind.
- Commit messages: plain language describing the actual work ("Zetaris compose stack with
  verify gate"), no feat:/fix:/docs: prefixes, no "infra work" labels.
- Never bundle git add + commit + push into one command. main is golden: no direct pushes —
  work on feat/<area>-* branches, push the branch only after verify.sh/smoke are green, PR to main.
- Never push without an explicit go-ahead from your human lead; one approved push does not
  authorize future pushes.

## Never
Commit or print secrets. Let Zetaris's platform .env anywhere near git. Register the
Lightning data-source tables before the build window opens (Oct 22) - prepare recipes only.
