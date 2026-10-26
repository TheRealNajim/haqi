# infra/RUNBOOK.md — Zetaris + Meterless on the infra PC

Owner: infra lead. Everything here is a manual step: if it is not written down, it did not
happen. The gate this runbook exists to clear (infra/AGENTS.md):

- Zetaris platform running on Docker Desktop, `verify.sh` 9/9, sample query returns rows
- Meterless runtime running, OpenAI-compatible endpoint answering (eligibility, even though the
  product answers come from NVIDIA — see §3)
- One Nemotron route: **NVIDIA hosted** supplies all three `MODEL_*` values
- `backend/smoke_test.py`: 6 LOCAL PASS offline; INFRA Zetaris and Nemotron PASS once configured
  (they report SKIP, not FAIL, while unset)
- Env values reach the deployed API through the **Render dashboard**, never chat or git

Last verified state: see [Status](#status) at the bottom. Update it every session.

## 1. Machine and prerequisites

| Item | Required | This PC |
|---|---|---|
| Docker Engine | 25+ with Compose v2 plugin | 29.9.2 / Compose 5.6.0 — PASS |
| Memory given to Docker | 8 GB recommended, 6 GB hard minimum | ~7.5 GB — WARN (works, but raise to 8 GB) |
| CPUs given to Docker | 4 recommended | 20 — PASS |
| Disk for images | 15 GB free where Docker stores images | ~950 GB — PASS |
| Architecture | amd64 | x86_64 — PASS |

Windows specifics (as built, 25 Oct):

- Docker Desktop uses the WSL2 backend, with Ubuntu 26.04.1 LTS registered as the default
  distro: `wsl --install -d Ubuntu --no-launch`.
- Docker Desktop's WSL integration for Ubuntu is required. With it off, the `docker` shim
  inside Ubuntu answers "The command 'docker' could not be found in this WSL 2 distro."
  Docker Desktop 4.96 has no CLI switch for it: add the distro to
  `%APPDATA%\Docker\settings-store.json` as `"IntegratedWslDistros": ["Ubuntu"]` and restart
  Docker Desktop (`docker desktop restart`).
- A Docker Desktop restart stops the stack for a minute; containers are `restart:
  unless-stopped` and come back on their own (verified).
- Run the two shell scripts as the normal Ubuntu user `najim`, from the bundle path:
  `wsl -d Ubuntu -- bash -lc 'cd /mnt/c/.../zetaris-platform && ./preflight.sh'`.
  Root is not needed; membership in the `docker` group is. Repeat `docker login` inside
  Ubuntu first: preflight reads `$HOME/.docker/config.json`, which is per-user and separate
  from the Windows credential store. Both scripts were run as `najim` on 25 Oct (9/9).
- Memory is what Docker Desktop gives its VM. `MemoryMiB` in `settings-store.json` is
  ignored in 4.96; use Settings > Resources > Memory. At 7.5 GB the gate still passes
  (WARN, not FAIL).

## 2. Zetaris install

The archive is licensed and account-bound: it comes from
<https://cloud.enterprise.zetaris.com/dashboard/download> (Run locally page) together with a
registry sign-in command. The registry is `zetarishackathon.azurecr.io`.

```bash
# 1. Unzip, outside Downloads
unzip zetaris-platform.zip
cd zetaris-platform

# 2. Registry sign-in. Paste the command from the download page; it carries
#    username + password. Never put the token in a file or a chat message.
#    (A rotated token looks like: ' <token>' | docker login zetarishackathon.azurecr.io \
#     -u <user> --password-stdin )
docker login zetarishackathon.azurecr.io

# 3. Preflight. Fix every FAIL before pulling; it catches low memory and a
#    missing login that otherwise fail 20 minutes later with a misleading error.
./preflight.sh

# 4. Images (~4 GB) then start. First start takes 5-10 minutes.
docker compose pull
docker compose up -d

# 5. init and bootstrap must show Exited (0) — they are setup jobs, not services.
docker compose ps --all
```

Bundle facts:

- `.env` ships filled in. Sign in as `admin@zetaris.com` with `ZETARIS_ADMIN_PASSWORD` from the
  platform `.env` (org **1**) — that is the account that owns the project data and the REST key.
  `haqi@zetaris.com` also exists in org **810**, but that organisation is empty, so the project
  views and the API token list are invisible from it. Change the password from the user menu
  (top right) after the first login.
- Repeated failed sign-ins appear to lock the account for a while: after that, even the
  correct password returns `{"msg":"Not Allowed"}` and the api logs `User does not exist`.
  Wait a few minutes instead of retrying in a loop.
- `.env` also holds the field-encryption keypair password. Back it up; without it, stored
  datasource credentials cannot be recovered.
- Sizing: bundle `.env` = 2 GB / 2 cores (laptop). `ZSPARK_DRIVER_MEM` decides query speed;
  `spark.driver.memory` in `conf/spark-defaults.conf` is ignored (command line wins).
- `docker compose down -v` deletes the metastore and the keypair. Use plain `down` for a
  normal stop.

URLs and endpoints (owned by infra; keep `docs/CONTRACTS.md` in sync):

| Service | Address | Notes |
|---|---|---|
| Zetaris UI | <http://localhost:3000> | sign in as `admin@zetaris.com` |
| Zetaris REST | `http://localhost:8888/api/v1.0` | the only REST base |
| REST port 8889 | internal | the UI's login route proxies here (`/api/v1.0/internal/auth/legacy-login`) |
| Spark UI | <http://localhost:4040> | debugging only |
| JDBC | `jdbc:zetaris:lightning@localhost:10000` | driver jar in `jdbc/` |

REST call shape used by `backend/agent/tools_zetaris.py` and `smoke_test.py`:

```
POST {ZETARIS_REST_URL}/sql-editor/sqls/run
Authorization: Bearer <ZETARIS_API_KEY>
X-Org-ID: 1
X-Request-ID: <fresh UUID>
{"queryId": "<fresh UUID>", "sql": "SELECT 1", "source": "SqlEditor", "limit": 1}
```

Verify:

```bash
./verify.sh          # nine checks, ends with a query through the whole stack
```

Sample data (registered on first start, read in place from the public bucket — needs
outbound internet): `NY_TAXI` (15 CSV tables) and `TPCDS_DB` (24 Parquet tables). Try
`SELECT * FROM NY_TAXI.customers LIMIT 10`.

`ZETARIS_API_KEY` — there is no token UI in this build.

`http://localhost:3000` has no Management / API Tokens page: the UI bundle carries no
`api-key` route, and `POST /api/v1.0/auth/api-key` returns `404` on both 8888 and 8889 for a
valid admin JWT (probed 26 Oct with four body shapes). `GET /api/v1.0/auth/api-key` does work
and is the way to confirm what exists.

Token internals (verified 26 Oct):
- Zetaris API tokens have an `ak` prefix and a fixed length of 60 characters (`ak` + 58 hex chars).
- The REST API hashes the incoming token with SHA-256 and matches it against
  `lightning_user_api_key.api_key`. Key values live only in `.env` and the Render dashboard —
  never in a doc, commit or chat. Read keys from secrets, not from this page.
- `lightning_user_api_key.api_key` stores **SHA-256 hex of the plaintext token** (64 chars).
  Verified by hashing the live token from `.env` and matching the stored value.
- Rows are scoped by `org_id` **and** `email`. The project data lives in org **1** under
  `ADMIN@ZETARIS.COM`; a token created for any other org cannot see the views.

The key can disappear. `infra/zetaris/restore-key.ps1` puts it back and proves it:

```powershell
powershell -NoProfile -File infra/zetaris/restore-key.ps1
```

It is idempotent — inserts the row only when the SHA-256 of the `.env` token is missing, then
runs `SELECT 1` through the REST contract. **Run it after any stack restart or bootstrap
re-run**, before blaming the backend. Symptom when the row is gone: every container reports
healthy, `verify.sh` still passes (it logs in rather than using the key), and every
`ZETARIS_API_KEY` call returns `400`.

Rotating the key by hand:

1. Generate a token: `ak` + 58 lowercase hex characters.
2. Compute `sha256(token)` -> 64 lowercase hex characters.
3. Insert into the metastore, using the org and email the recipe is reachable from:
   `insert into lightning_user_api_key (id,name,org_id,email,api_key,created_at,expired_at,last_used_at,api_key_masked) values ('<uuid>','<name>',1,'ADMIN@ZETARIS.COM','<sha256>',now(),'2031-10-26',null,'<mask>');`
   Run it as `docker exec zetaris-postgres-1 psql -U zetaris -d metastore -c "..."`.
4. Prove the new token **before** removing anything: `SELECT 1` through the REST contract
   above. If it does not return `1`, delete the row you just inserted and stop.
5. Delete the old rows by id, then re-run `infra/healthcheck.ps1` and
   `infra/zetaris/check-recipe.ps1`.
6. Update `.env` and the offline secrets file. Never paste the value into docs, commits or
   chat.

Rotation log: 26 Oct — `haqi-official-key` (the leaked one) and `haqi-backend-key` were
deleted and replaced by `haqi-backend-20261026` (org 1, 5-year expiry). The leaked token now
returns `400` from the query engine, so the copy sitting in git history is inert. Never
paste the value into docs, commits or chat; regenerate with the steps above if it leaks again.

### After any stack restart

A restart can leave every container `healthy` while two things are silently gone: the API key
row and the recipe catalog. Both were lost on 26 Oct and nothing in `docker ps` said so. Run
these before blaming the backend or the adapter:

```powershell
powershell -NoProfile -File infra/zetaris/restore-key.ps1
powershell -NoProfile -File infra/zetaris/ensure-recipe.ps1
powershell -NoProfile -File infra/healthcheck.ps1
```

Both repair scripts are idempotent — they probe first and only write what is missing. `verify.sh`
is not enough on its own: it signs in with the admin password, so it passes 9/9 even when the
REST key and the recipe are gone.

**Do not run `docker compose up` during the demo window.** A re-run can reset the catalog, and
the recovery is two scripts plus a minute of waiting.

## 3. Meterless and the Nemotron route

Option A — Meterless runtime on this PC (the hackathon route). Meterless for Windows ships as
the Nightshift runtime app (Windows 10/11 64-bit, dedicated GPU: CUDA on NVIDIA, Vulkan on
others): <https://www.meterless.ai/windows.html>.

Hardware finding (25 Oct): this machine is an ASUS Zenbook UX3402VA, 15.6 GB RAM, Intel Iris Xe
integrated graphics — no NVIDIA GPU, no dedicated GPU at all. The bundled llama.cpp does ship
Vulkan and CPU backends, so the runtime starts on this PC; expect CPU/Vulkan speed, not the RTX
figures on the marketing page.

Installed and running (25 Oct):
- Nightshift 1.2.7, per-user at `%LOCALAPPDATA%\Nightshift` (unsigned vendor build; SHA-256
  checked against `APP_BUILD_INFO.txt`). Silent install: `Nightshift_1.2.7_x64-setup.exe /S`.
- Runtime: `meterless-runtime.exe` starts `meterlessd`; the hotspot answers on
  `http://127.0.0.1:8088`. It survives closing the window (daemon keeps running).
- Token file: `%LOCALAPPDATA%\ai.meterless.runtime\proxy-token` (32 chars). The app also shows a
  connect link (`http://<host>:<port>/connect#k=<key>`). Treat it as a secret.
- Autostart: the daemon comes up when `meterless-runtime.exe` is launched. After a reboot,
  start it once (or let Nightshift autostart) before the demo — without it `/healthz` fails and
  the app silently falls back to the deterministic path.
- `/v1/models` returned 73 ids, all routing modes (`meterless/auto`, `fast`, `deep`, `cheap`,
  `local`, `fusion`, `cluster`, `text`, `code`, `vision`, …) — none is `nvidia/nemotron-*`.
- Chat is NOT wired yet: `POST /v1/chat/completions` answers
  `400 no_provider_configured` — "Add a cloud key in Setup or install/start a local model".
  So the runtime is up, but it has no engine behind the route.

Decision taken 25 Oct (backend lead): the product answers run on **NVIDIA hosted**
(build.nvidia.com), not Meterless. This PC has no dedicated GPU, so a hosted route is the
honest one; Meterless cannot serve it anyway — none of its 73 ids is `nvidia/nemotron-*`.
Meterless stays installed and running only because eligibility requires it running during the
event. Never mix: all three `MODEL_*` values come from the NVIDIA route below.

Runtime checks:

```bash
# is the process up? (does not prove the model route works)
curl -s http://127.0.0.1:8088/healthz        # {"status":"ok","engine":"meterless"}

# the real check: 200 with model ids = online, 401/403 = token needed,
# anything else = offline. Read the ids from here and use one verbatim.
curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:8088/v1/models

# does it actually generate? this is the check that failed on 25 Oct
curl -s -X POST http://127.0.0.1:8088/v1/chat/completions \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -H "meterless-app: haqi" -H "meterless-scope: user" \
  -d '{"model":"meterless/auto","messages":[{"role":"user","content":"Reply: ready"}],"max_tokens":16}'
```

- Requests carry `Authorization: Bearer <token>`, `meterless-app: haqi`, and
  `meterless-scope: user` on chat calls.
- Auto-detect scans ports 8088, 8090, 8787, 11434 on localhost.

### The route we use — NVIDIA hosted (build.nvidia.com)

Create a key at build.nvidia.com, then set all three rows together:

```
MODEL_BASE_URL=https://integrate.api.nvidia.com/v1
MODEL_API_KEY=<build.nvidia.com key>
NEMOTRON_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
```

Verified live 26 Oct with our key: 85 ids in `GET /v1/models`, this id present, and a chat
completion answered in ~1.6 s. `nvidia/nemotron-3.5-bolt-e4b` and
`nvidia/nemotron-3-super-120b-a12b` are both still listed in the catalogue, so the id is a
choice, not a constraint — pick one and use it everywhere (local `.env`, Render, docs).

Verify without the app:

```bash
curl -s -H "Authorization: Bearer $KEY" https://integrate.api.nvidia.com/v1/models | jq -r '.data[].id' | grep nemotron
curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"nvidia/nemotron-3.5-lightning-30b-a3b","messages":[{"role":"user","content":"Reply with the single word: ready"}],"max_tokens":400}'
```

**Thinking is on by default and eats the token budget.** The same prompt costs 155 completion
tokens by default (reasoning lands in `message.reasoning_content`) and 2 with
`chat_template_kwargs: {"enable_thinking": false}`. A small `max_tokens` therefore returns
`finish_reason: stop` with **empty `content`** — that is not a broken route. The product's
`chat()` sends no `max_tokens`, so it works, but the parse step pays for reasoning it does not
need; `enable_thinking: false` is worth setting in the backend for latency.

Meterless is a separate route with a separate token (`%LOCALAPPDATA%\ai.meterless.runtime\proxy-token`).
Once `MODEL_API_KEY` holds the NVIDIA key, the Meterless `/v1/models` call answers `401` —
that is expected. Only `/healthz` is needed from Meterless for eligibility.

## 4. Repo `.env` (never committed)

```bash
cp .env.example .env      # repo root; the backend loads it with its own zero-dependency loader
```

- `backend/app/main.py` parses `.env` itself. `python-dotenv` is **not** a dependency — do not
  add it to `requirements.txt` to "fix" a missing value.
- Root `.env.example` is canonical: every adapter key plus the `MODEL_*` route. `backend`'s
  file carries the same names because Render builds with `rootDir: backend`.
- Names are fixed by `docs/CONTRACTS.md`; renaming or adding one is a contract change.
- Fill values, never commit `.env` (gitignore already covers it), never print secrets.

### Local pre-flight

```bash
python backend/smoke_test.py     # from the repo root
```

`smoke_test.py` is split so nobody is blocked:

| Block | Expectation |
|---|---|
| LOCAL (6 PASS lines) | always pass on a clean machine, no infra needed |
| INFRA Zetaris SQL over REST | SKIP while `ZETARIS_*` is unset; PASS once set |
| INFRA Nemotron replies | SKIP while `MODEL_*` is unset; PASS once the NVIDIA route works |

Exit 0 unless an INFRA check is configured and broken. The real gate is not "everything PASS" —
it is `POST /sources/status` showing the Zetaris and Nemotron slots as `configured: true`, with
every other slot either configured or an explicit environmental blind.

### Delivering values to the deployed API

The backend runs at `https://haqi-api.onrender.com` (Render free tier, `rootDir: backend`).
Keys go in **Render → haqi-api → Environment**, never chat and never a commit:

- `backend/.env.example` and `render.yaml` list the names; `sync: false` makes Render ask for
  each value when the blueprint applies.
- Render cannot reach this PC. The loopback value `ZETARIS_REST_URL=http://localhost:8888/api/v1.0`
  is dead from Render — use the tunnel below, and never paste the loopback URL into the dashboard
  and call the slot armed.
- Free-tier disk is ephemeral: `HAQI_DATA_DIR` (the trust ledger) does not survive a redeploy.

#### Exposing Zetaris to Render (quick tunnel)

The deployed API is the product, so the Zetaris slot there needs a public URL. `cloudflared`
puts one in front of the loopback REST port:

```powershell
powershell -NoProfile -File infra\zetaris\tunnel.ps1          # status + the rows to paste
powershell -NoProfile -File infra\zetaris\tunnel.ps1 -Start   # start (downloads cloudflared once)
powershell -NoProfile -File infra\zetaris\tunnel.ps1 -Stop
```

`-Start` prints the three rows and proves the tunnel with a real `SELECT 1` through the public
hostname. Paste into Render → Environment, then redeploy:

```
ZETARIS_REST_URL=https://<random>.trycloudflare.com/api/v1.0
ZETARIS_ORG_ID=1
ZETARIS_API_KEY=<the ak token already in .env>
```

Verified 26 Oct through the public hostname: `SELECT 1` → `1`, the recipe row
(`open-meteo:lagos | 14.0 | ugm3 | 17:00Z`), and **no key → `400`** — the URL alone opens nothing.

**After a reboot the tunnel comes back by itself** (task `haqi-zetaris-tunnel`, registered for
this user at logon +1 min). Docker Desktop starts on its own; the task waits up to 5 minutes for
`127.0.0.1:8888`, then runs `tunnel.ps1 -Start` and logs to
`%LOCALAPPDATA%\haqi-demo\autostart.log`:

```powershell
powershell -NoProfile -File infra\zetaris\install-autostart.ps1          # register (once)
powershell -NoProfile -File infra\zetaris\install-autostart.ps1 -Status  # armed? last result?
powershell -NoProfile -File infra\zetaris\install-autostart.ps1 -Remove  # undo
```

Rehearsed 26 Oct: `-Stop`, then `Start-ScheduledTask haqi-zetaris-tunnel` → new hostname in 13 s,
`SELECT 1` → `1`, recipe row `17.4 ugm3 @ 18:00Z`, no key → `400`. The task restores *a* tunnel,
never the *same* URL — Render still needs the new hostname by hand.

Caveats, in order of how likely they are to bite:

- **The hostname changes on every cloudflared restart.** Quick tunnels are anonymous; there is
  no stable name without a Cloudflare account. After a restart, re-run `-Start` and update
  `ZETARIS_REST_URL` in Render + redeploy. Nothing on this PC can update Render by itself — there
  is no Render API key here.
- **This laptop must stay awake, online and open.** AC standby and hibernate are off, but the
  Zenbook's firmware exposes no lid-close setting (`LIDACTION` does not exist in the power
  scheme), so closing the lid sleeps it and the tunnel dies. Leave the lid open and the charger
  plugged in for the whole judging window.
- **If cloudflared dies, Render's Zetaris slot fails loudly**, not silently: the adapter raises
  an unreachable error rather than inventing a reading.
- **The edge is public.** The hostname is unguessable, Zetaris still requires the bearer key, and
  the REST port is the one meant to be called. Still: `/Stop` it after the event.
- **A `configured: true` slot is not an integration.** On `main` after `fc685f5`, `_sql_for()`
  queries the recipe view, but `ZetarisAdapter` is still absent from
  `backend/app/agent.py::_adapters_for` — see `infra/zetaris/README.md` § Adapter wiring. Until
  that one line lands, the tunnel makes the badge green and changes no verdict.
- The tunnel process is detached through a VBS `ShellExecute`. `Start-Process` and WMI both fail
  here: one holds the caller's console handle (piping hangs), the other kills cloudflared.

#### If this PC is down during the demo

The product does not depend on this machine. The deployed API on Render keeps serving `/today`
from OpenAQ, OpenWeather and NASA FIRMS, which call the internet directly and report
`configured: true` on their own. What is lost is the **Zetaris slot** and the claim that
**Meterless is running during the event** — both are eligibility claims, not app functionality.

Say it plainly rather than hiding it: the Zetaris SQL layer lives on the infra host and its
quick-tunnel URL died with the host. Do not present a `configured: true` badge as a working
integration; a slot that errors is a disclosed blind, a green badge over nothing is a false claim.
Recovery order: reopen the laptop, confirm Docker is up, run `tunnel.ps1 -Start`, relay the new
hostname, redeploy Render. Budget two minutes, and only if the person who owns the Render
dashboard is reachable.
- **The edge is public.** The hostname is unguessable, Zetaris still requires the bearer key, and
  the REST port is the one meant to be called. Still: `/Stop` it after the event.
- **A `configured: true` slot is not an integration.** On `main` after `fc685f5`, `_sql_for()`
  queries the recipe view, but `ZetarisAdapter` is still absent from
  `backend/app/agent.py::_adapters_for` — see `infra/zetaris/README.md` § Adapter wiring. Until
  that one line lands, the tunnel makes the badge green and changes no verdict.
- The tunnel process is detached through a VBS `ShellExecute`. `Start-Process` and WMI both fail
  here: one holds the caller's console handle (piping hangs), the other kills cloudflared.

## 5. Ports (infra documents reality)

| Service | Port | Owner |
|---|---|---|
| haqi backend | 8000 | backend |
| Zetaris UI | 3000 (loopback) | infra |
| Zetaris REST | 8888 | infra |
| frontend dev server | 5173 | frontend |
| Zetaris JDBC | 10000 | infra |
| Meterless runtime | 8088 | infra |
| Zetaris API internal login route | 8889 (loopback) | vendor — never used by the app |
| Zetaris Spark UI | 4040 (loopback) | vendor — diagnostics only |

Only the ports above are published. `8888` is the public API; `8889` is the API's internal
login route, published as `127.0.0.1:8889` by the vendor because the UI needs it — it must
never be reachable from another machine, and nothing we write should call it. Check what is
actually listening with `docker port zetaris-api-1` or `docker compose ps` before exposing
anything.

Security deviation found and closed (25 Oct): the vendor compose publishes the UI as
`"${UI_PORT:-3000}:3000"`, which binds `0.0.0.0` — the one service outside its own loopback
policy. The platform `.env` now sets `UI_PORT=127.0.0.1:3000`, so `docker port zetaris-ui-1`
reports loopback only. Reverting is one line and does not touch images:
`UI_PORT=3000`, then `docker compose up -d ui`. The previous file is kept beside it as
`.env.bak-before-loopback`. The bundled `verify.sh` still passes 9/9 after the change.
`ALLOWED_ORIGINS` in the platform `.env` is `http://localhost:3000` — leave it there for a local
install; it must change before the UI is served from another host.

## 6. Everyday start and the one-command check

Everything below is Windows-side. The stack is started by Docker Desktop, not by hand.

```powershell
powershell -ExecutionPolicy Bypass -File infra\healthcheck.ps1
```

It is read-only and exits non-zero if anything required is down. It checks: Docker engine,
the four Zetaris services and their health, the two one-shot jobs (`init`, `bootstrap` must
be `exited 0`, not running), UI `/api/config`, a real `SELECT 1` through REST with the API
key from `.env`, the published recipe (`haqi_views.air_quality_readings`) returning a fresh
contract row, the Meterless hotspot (`/healthz`, eligibility), and the configured model
route end to end — catalogue, id present, and a real completion. Secrets are read from `.env`
and never printed. Sample output on a good day:

```
  PASS  docker engine 29.9.2
  PASS  postgres: running (healthy)  ... driver, api, ui
  PASS  init: completed (exit 0)     PASS  bootstrap: completed (exit 0)
  PASS  ui: /api/config 200
  PASS  zetaris rest: SELECT 1 -> 1
  PASS  recipe: haqi_views.air_quality_readings -> 13.4 ugm3, 0.2 h old
  PASS  meterless: /healthz http://127.0.0.1:8088
  PASS  model route: integrate.api.nvidia.com / nvidia/nemotron-3.5-lightning-30b-a3b
  PASS  model route: id present in catalogue (85 ids)
  PASS  model route: nvidia/nemotron-3.5-lightning-30b-a3b replied (ready)

All required checks passed. Demo-ready.
```

The route block also catches the failure this whole document keeps repeating: a Meterless id
sent to NVIDIA, or an `nvidia/*` id sent to localhost, is reported as `routes mixed` before
anything queries it. A `400` on the completion still shows as `WARN` (endpoint up, no provider)
because that is the Meterless-without-a-key state, not a crash.

Autostart after a reboot (verified 25 Oct):

- Docker Desktop: `AutoStart` is `true` in `%APPDATA%\Docker\settings-store.json`, so the
  engine comes up at login. The four services are `restart: unless-stopped` and return on
  their own; `init` and `bootstrap` stay exited by design.
- Meterless: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nightshift Runtime.lnk`
  launches `meterless-runtime.exe`, which starts `meterlessd`. It takes a few seconds after
  login, so the first health check may be too early.
- The runtime token lives at `%LOCALAPPDATA%\ai.meterless.runtime\proxy-token`. It is created
  on first install and **survives restarts** — measured 25 Oct across a kill + relaunch, same
  hash, `/v1/models` 200 with the old value. Copy it once into `MODEL_API_KEY`; re-copy only if
  the runtime is reinstalled or the file is deleted.

WSL user: `najim` (uid 1000, member of `docker` only, no sudo) is the default for
`wsl -d Ubuntu`, set in `/etc/wsl.conf`. Run the vendor scripts as that user:

```bash
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/.../zetaris-platform && ./verify.sh'
```

`wsl -d Ubuntu -u root -- …` still works for one-off repairs; day-to-day work does not need
root and holding the Docker socket is enough.

### The recipe gate

Closed for one source on 25 Oct. The backend adapter raises until infra publishes a queryable
name whose first five columns are `source_id, raw_value, unit, distance_km, observed_at`.
That name is now **`haqi_views.air_quality_readings`** — a schema-store view over the Lightning
REST table `HAQI.AIR_QUALITY` (Open-Meteo air quality, Lagos point, keyless, hourly).

```powershell
powershell -ExecutionPolicy Bypass -File infra\zetaris\check-recipe.ps1 -Table haqi_views.air_quality_readings
# PASS  haqi_views.air_quality_readings matches the adapter row contract.
```

`infra/zetaris/README.md` has the exact DDL, the live output, and the remaining gaps (PM2.5
only; WAQI/OpenAQ/OpenWeather/FIRMS wait on their API keys). The rules themselves are proven by
`-SelfTest`, which needs no network.

Publishing the name is necessary but **not sufficient**. On `main` after `fc685f5`, `_sql_for()`
already queries this view in contract order — but `ZetarisAdapter` is still not in the agent's
adapter list (`backend/app/agent.py`, `_adapters_for`). Until that one line lands,
`configured: true` on `/sources/status` is cosmetic and the sponsor layer contributes nothing to
`/today`. The wiring snippet is in `infra/zetaris/README.md` § Adapter wiring.

### Running the demo from this PC

The deployed API cannot see Zetaris on `127.0.0.1:8888`, so its Zetaris slot is an honest
blind no matter what key is pasted into Render. There are two topologies:

| | Run here | Deployed (Render) |
|---|---|---|
| Zetaris slot | real, over loopback | blind — needs a tunnel |
| Other sources | only if their keys are in `.env` | OpenAQ, Weather, Fire live |
| Nemotron | NVIDIA hosted | NVIDIA hosted |
| Network exposure | none (loopback only) | public |

With the source keys in `.env` and the adapter wired, running here is the only topology where
every slot is genuine. **Decision taken 26 Oct: the demo runs on the deployed API, with Zetaris
reached through the quick tunnel (§4).** This local runner stays documented as the fallback for
the case where the tunnel or Render is down — it needs no network path at all. One command:

```powershell
powershell -ExecutionPolicy Bypass -File infra\demo-local.ps1          # preflight, then start
powershell -ExecutionPolicy Bypass -File infra\demo-local.ps1 -Status  # what is listening
powershell -ExecutionPolicy Bypass -File infra\demo-local.ps1 -Stop    # stop api + web
```

It refuses to start when the product keys are missing, because `/today` would then answer
`0/4 sources` — a worse demo than the deployed one. `-Force` starts anyway. On start it also
re-runs `restore-key.ps1` and `ensure-recipe.ps1`, so a stack restart between runs cannot leave
you with a dead key or a missing view.

What it starts, and why each flag matters:

- **api** — `.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`.
  Loopback only, unlike `uvicorn --host 0.0.0.0`.
- **web** — `npm run dev -- --host 127.0.0.1 --port 5173` with
  `VITE_API_PROXY_TARGET=http://127.0.0.1:8000`. The dev server always calls same-origin `/api`
  and proxies it to that target; without the variable it proxies to the deployed API and you
  are back to the blind slot. Vite binds every interface by default — the `--host` flag is what
  keeps it on loopback.
- Launchers, PIDs and logs live in `%LOCALAPPDATA%\haqi-demo\` (`api.log`, `web.log`). The
  children are created through WMI, not `Start-Process`, so piping this script's output does
  not hang waiting for a server that never exits.

`Zetaris` and `Meterless` are not touched by the script; they keep running for eligibility
either way.

## 7. Backup and recovery

The expensive state is not the containers — it is `zetaris_pgdata` (metastore, accounts, audit,
registered sources) and the `.env` that holds the keypair password. Restarting is free; losing
those is not.

Nightly or before any risky change, with the stack running:

```powershell
powershell -ExecutionPolicy Bypass -File infra\backup.ps1
```

It writes `backups\<timestamp>\` containing `metastore.dump`, `audit.dump`, a copy of the
platform `.env`, and `restore-test.txt`. Then it proves the dumps: each one is loaded into a
throwaway database, key tables are compared against live row counts, and the throwaway is
dropped. The stack is never stopped. `backups/` is gitignored — treat the folder as a secret,
because of the `.env` copy.

First drill, 25 Oct: `metastore` restored 185 tables with `lightning_database` 2/2,
`lightning_user_api_key` 2/2 and `filestore_table` 39/39; `audit` restored 10 tables. Pass.

If `pg_dump` is not enough (for example the volume is corrupt), the cold path is a volume
archive — this one does stop the stack:

```bash
docker compose down
docker run --rm -v zetaris_pgdata:/from -v "$PWD":/to alpine \
  tar czf /to/zetaris-pgdata-$(date +%F).tar.gz -C /from .
cp .env zetaris-platform.env.backup
docker compose up -d

# Restore: with the stack stopped and the volume empty
docker compose down
docker volume create zetaris_pgdata
docker run --rm -v zetaris_pgdata:/to -v "$PWD":/from alpine \
  tar xzf /from/zetaris-pgdata-<date>.tar.gz -C /to
docker compose up -d
```

- `docker compose down -v` is the one command that destroys both. Treat it as "factory reset".
- Keep the backup outside this PC if the demo depends on it (OneDrive is enough for a hackathon).
- The repo `.env` (API token, admin password) is recoverable by regenerating; the platform `.env`
  (keypair password) is not — datasource credentials encrypted with it are lost with the volume.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `pull access denied` | registry login missing or token rotated: re-run the login command from the download page |
| Pull crawls at <100 KB/s | route to the ACR, not this PC. Check with `Resolve-DnsName zetarishackathon.azurecr.io` and compare a normal download; a VPN with a closer/US exit usually fixes it. Do not restart repeatedly — completed layers are kept, partial ones restart |
| driver never becomes healthy | Docker has less than ~6 GB or fewer than 4 CPUs: raise in Settings > Resources, then `docker compose up -d` |
| `crypto.randomUUID is not a function` | UI opened over plain HTTP on a non-localhost address — use `localhost` or HTTPS |
| `bootstrap: still running` | still loading sample data; wait, check `docker compose ps --all` |
| no `NY_TAXI` / `TPCDS_DB` | host could not reach S3: see `sample-data-seed.log` in the `driver-logs` volume |
| Bootstrap keeps restarting, `.env` shows `'$' in password` warnings | admin password contains a character outside `$ @ ! % * ? &`, or fewer than 8 chars with lower/upper/digit. Fix `.env` and `docker compose up -d` |
| New install logs `password authentication failed` | a previous install's `zetaris_pgdata` volume is being reused with a different `POSTGRES_PASSWORD`: `docker compose down -v` (destroys data) or restore the old password |
| `smoke_test.py` Nemotron FAIL | all three `MODEL_*` must come from one route; check `/v1/models` first, then the model id spelling |
| Meterless chat `400 no_provider_configured` | runtime is up but nothing serves the route: add a cloud key in the app's Setup (Meterless credit or NVIDIA) or install/start a local model. `/healthz` 200 does not cover this |

## 9. Status

| Date | What | Result |
|---|---|---|
| 22 Oct | `zetaris-platform.zip` downloaded, extracted, registry login stored | done |
| 23 Oct | Docker 29.9.2, Compose 5.6.0, 7.5 GB / 20 CPU / ~950 GB free | PASS (memory WARN) |
| 23 Oct | ACR resolves to `r0922eus-2-az.eastus.cloudapp.azure.com` (East US), ~1.2 s TLS RTT, ~65 KB/s while a container download from the same Docker VM does ~1.4 MB/s | route bottleneck, see troubleshooting |
| 25 Oct | `docker compose pull` finished; driver image 8.46 GB, UI 319 MB, API 980 MB | done |
| 25 Oct | postgres/driver/api/ui all `running (healthy)`, `init` and `bootstrap` `Exited (0)` | PASS |
| 25 Oct | UI `/api/config` 200, admin login returns `idToken` + `orgId`, `select 7 as seven` round-trips ui -> api -> driver -> spark | PASS |
| 25 Oct | Sample query `select * from NY_TAXI.customers limit 10` returns 10 rows | PASS (gate met) |
| 25 Oct | REST `:8888` accepts the admin login `idToken` as Bearer for `sql-editor/sqls/run` — 15-minute lifetime, not usable as a shipped key | fallback only |
| 25 Oct | Ubuntu 26.04.1 LTS installed as WSL2 distro, set as default, Docker Desktop integration enabled | PASS |
| 25 Oct | `preflight.sh` inside Ubuntu: 8 PASS + 2 WARN (memory 7 GB, existing `zetaris_pgdata` volume) | PASS |
| 25 Oct | `verify.sh` inside Ubuntu: 9 checks, 9 pass | PASS — official gate met |
| 25 Oct | `ZETARIS_API_KEY` (`ak`, 5-year) created in the UI, verified `SELECT 1`, stored only in repo `.env` | done |
| 25 Oct | `backend/smoke_test.py`: 7 PASS (6 LOCAL + INFRA Zetaris SQL), Nemotron FAIL `no_provider_configured` | partial — runtime up, no engine behind it |
| 25 Oct | Meterless/Nightshift 1.2.7 installed, SHA-256 verified, `meterlessd` running | done |
| 25 Oct | Hotspot `/healthz` 200, `/v1/models` 73 ids with token, `:8088` wired into repo `.env` | PASS |
| 25 Oct | `chat/completions` on `meterless/auto`: 400 "No provider is configured" | FAIL — needs cloud key or local model, see §3 |
| 25 Oct | Ubuntu user `najim` (docker group, no sudo) created and made the default; `docker`/`compose` work without root | done |
| 25 Oct | Docker Desktop `AutoStart` set to `true`; engine and all four services return after a restart | PASS |
| 25 Oct | Nightshift startup shortcut created at `%APPDATA%\...\Startup\Nightshift Runtime.lnk` | done |
| 25 Oct | Restart drill: killed `meterlessd` + the `:8088` node process, relaunched the shortcut target — `/healthz` ok in 3 s, `/v1/models` 73 ids | PASS |
| 25 Oct | Token check across that restart: `proxy-token` hash unchanged (`9DB3798C`), still valid | PASS — token does **not** rotate |
| 25 Oct | `infra/healthcheck.ps1`: 12 pass + 1 WARN (no model provider), no secrets printed | PASS |
| 25 Oct | `infra/zetaris/check-recipe.ps1`: 5 self-tests pass; live DESCRIBE against `NY_TAXI.customers` correctly rejected | PASS (no recipe yet) |
| 25 Oct | Confirmed grammar: `SHOW LIGHTNING DATABASES`, `SHOW LIGHTNING TABLES <DB>`, `SHOW TABLES IN <DB>`, `DESCRIBE <DB>.<TABLE>`; metastore has 0 REST tables, 0 datasources | recorded in `infra/zetaris/README.md` |
| 25 Oct | REST table registration path unproven in the bundle (no UI wizard); vendor command reference documents it | resolved same day |
| 25 Oct | OpenAPI spec is live at `http://localhost:8888/redoc/docs.yaml`, HTTP Basic only — bearer key and UI JWT both 401 (284 paths). `/redoc/index.html` is the browsable page | recorded in `infra/zetaris/README.md` |
| 25 Oct | `CREATE LIGHTNING DATABASE HAQI`, `CREATE LIGHTNING REST TABLE AIR_QUALITY`, `CREATE SCHEMASTORE VIEW air_quality_readings` via SQL editor | PASS — live |
| 25 Oct | Recipe `haqi_views.air_quality_readings` returns the 5 contract columns in order; Open-Meteo PM2.5 15.0 ugm3, `observed_at` 15:00Z | PASS, checker exit 0 |
| 25 Oct | `infra/backup.ps1` wrote dumps and restored both into throwaway databases, row counts matched | PASS (first drill, 185 + 10 tables) |
| 25 Oct | UI was bound to `0.0.0.0:3000`; pinned to `127.0.0.1:3000` via `UI_PORT` in the platform `.env` | fixed, `verify.sh` 9/9 after |
| 25 Oct | `verify.sh` run as the non-root `najim` user after the change | PASS 9/9 |
| 25 Oct | `feat/infra-env-example` rebased onto `origin/main` (`c1bea7c`), 14 commits, clean; safety branch `backup/pre-rebase-20261025` | PASS, not pushed |
| 25 Oct | `smoke_test.py` after the rebase: 6 LOCAL PASS, Zetaris PASS, Nemotron FAIL `no_provider_configured` | expected until the NVIDIA key lands |
| 25 Oct | Root `.env.example` reconciled with `backend/.env.example`: `HAQI_CORS_ORIGINS`, `HAQI_LOCATION_NAME`, `BRIGHTDATA_SERP_ZONE`, `HAQI_DATA_DIR` present; NVIDIA route spelled out | done — names now match contract v1.2+ |
| 25 Oct | Runbook corrected: own `.env` loader (no python-dotenv), split smoke-test expectations, NVIDIA route decided, Render dashboard as the delivery path | done |
| 25 Oct | Backend lead's message commit (`c1bea7c`) read: Render is live, NVIDIA hosted is the route, keys go to the dashboard | acted on |
