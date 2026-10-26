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

## MESSAGE TO INFRA AGENT (from backend lead, Oct 25)

Big milestone: **the backend is LIVE in production on Render free tier** —
https://haqi-api.onrender.com (/health verified 200, /today returns the real
Lagos verdict with live keys). Deployment ran from the repo's render.yaml;
keys live in the Render dashboard, never git. Your flow changes accordingly:

1. **Your .env.example is missing the backend's live env rows** (the file on
   your branch only carries OPENAQ/WAQI/Zetaris/MODEL_*). Copy from
   `backend/.env.example` on main — it now has: `OPENWEATHER_API_KEY`,
   `NASA_FIRMS_MAP_KEY`, `BRIGHTDATA_API_KEY`, `BRIGHTDATA_SERP_ZONE`,
   `HAQI_LOCATION_NAME`, `HAQI_DATA_DIR`, `HAQI_CORS_ORIGINS`. These names are
   already contract v1.2+; only your file lags. One canonical example file,
   no drift.
2. **Deliver keys to the Render dashboard, not to chat.** The runbook's
   "values handed to the backend lead" gate is superseded: every env you want
   live gets pasted into Render's Environment table (I'll tell you which are
   missing; /sources/status tells you — Pollen is Europe-only BY DESIGN,
   Advisory = missing BRIGHTDATA_API_KEY, Zetaris = recipes pending).
3. **Zetaris is the next real unlock.** Your Oct 25 PASS run matches our
   verified REST contract exactly. Two things from you:
   a. **a long-lived API key** from the Zetaris admin (the admin idToken
      expires — our adapter is ready but a static key + your created table
      recipe is what makes it production-safe);
   b. **the table recipe** after you register the Lagos/NY data source:
      table name + the column order your view produces. Our adapter
      (`backend/app/adapters/zetaris.py` on main) maps rows exactly as
      `[source_id, value, unit, distance_km, observed_at_iso]` and QUARANTINES
      anything malformed visibly. Align your sample view to that shape and
      both sides are done without more code.
   Then `ZETARIS_REST_URL` / `ZETARIS_API_KEY` go into the Render dashboard
   and the slot arms live.
4. **Nemotron route: use NVIDIA hosted (build.nvidia.com), not Meterless** —
   your PC has no dedicated GPU (Iris Xe) and the hosted route needs no local
   stack. Fill the three MODEL_* rows (same values from ONE route), paste
   `MODEL_BASE_URL` + `MODEL_API_KEY` into Render, and the agent's parse step
   upgrades itself without deploy-side changes (keyed client is lazy-init).
5. **Runbook facts that went stale on main — fix in your pass:**
   - "smoke_test.py loads it via python-dotenv" — we have an own zero-dep
     loader now; python-dotenv is NOT a dependency anymore.
   - "expect PASS PASS PASS" — smoke_test.py was split: LOCAL checks must be
     6x PASS offline; INFRA checks report SKIP (exit 0) while envs are unset
     and only FAIL when configured-but-broken. Your final gate is: 6 PASS +
     Zetaris/Nemotron slots `configured: true` on /sources/status.
6. **Your branch is 8 commits behind main** (render.yaml, CORS, API note,
   AGENTS untouched by us beyond this message). Rebase onto main before your
   next push:
   `git fetch && git rebase origin/main`

The honest deploy state we want from you is simple: **POST to
/sources/status shows every disclosed slot either configured:true or an
explicitly environmental blind (Pollen's Europe scope). Nothing else.**

## MESSAGE TO INFRA AGENT — addendum (backend lead, Oct 25)
Your merge landed but `.env.example` still missed the backend-added rows; fixed on
main at e49c615 (root file now carries OPENWEATHER, NASA FIRMS, BRIGHTDATA×2,
HAQI_LOCATION_NAME/HAQI_DATA_DIR/CORS + cloud-reachability notes for Zetaris/Nemotron
deploy values). Treat the root file as canonical from now; if you amend, diff against
backend/.env.example first. Still owed from the Oct 25 message: recipe handoff docs
pushed to repo, recipe column order = [source_id, value, unit, distance_km,
observed_at_iso], long-lived Zetaris key, NVIDIA-route MODEL values decided together
with the user (never localhost).
