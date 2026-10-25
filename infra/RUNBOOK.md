# infra/RUNBOOK.md — Zetaris + Meterless on the infra PC

Owner: infra lead. Everything here is a manual step: if it is not written down, it did not
happen. The gate this runbook exists to clear (infra/AGENTS.md):

- Zetaris platform running on Docker Desktop, `verify.sh` 9/9, sample query returns rows
- Meterless runtime running, OpenAI-compatible endpoint answering
- One Nemotron route: all three `MODEL_*` values from the same place
- `backend/smoke_test.py` = 3x PASS, values handed to the backend lead

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
- Run the two shell scripts as root inside Ubuntu, from the bundle path:
  `wsl -d Ubuntu -u root -- bash -lc 'cd /mnt/c/.../zetaris-platform && ./preflight.sh'`.
  Repeat `docker login` inside Ubuntu first: preflight reads `$HOME/.docker/config.json`,
  which is per-user and separate from the Windows credential store.
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

- `.env` ships filled in. Admin sign-in: `admin@zetaris.com` / `Zetaris1@` — change it from
  the user menu (top right) after the first login.
- `.env` also holds the field-encryption keypair password. Back it up; without it, stored
  datasource credentials cannot be recovered.
- Sizing: bundle `.env` = 2 GB / 2 cores (laptop). `ZSPARK_DRIVER_MEM` decides query speed;
  `spark.driver.memory` in `conf/spark-defaults.conf` is ignored (command line wins).
- `docker compose down -v` deletes the metastore and the keypair. Use plain `down` for a
  normal stop.

URLs and endpoints (owned by infra; keep `docs/CONTRACTS.md` in sync):

| Service | Address | Notes |
|---|---|---|
| Zetaris UI | <http://localhost:3000> | admin sign-in |
| Zetaris REST | `http://localhost:8888/api/v1.0` | the only REST base |
| REST port 8889 | do not use | internal |
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

`ZETARIS_API_KEY`: In the Zetaris web UI at <http://localhost:3000>, navigate to:
**Left sidebar -> Management (the shield/slider icon at the bottom) -> API Tokens**.
Click "Create API Token", enter a name (e.g. `haqi-backend`), and save.

Token internals (25 Oct):
- Zetaris API tokens have an `ak` prefix and a fixed length of 60 characters (`ak` + 58 hex chars).
- The REST API hashes the incoming token with SHA-256 and matches it against `lightning_user_api_key.api_key`.
- A 5-year key for `haqi` has been generated and verified against the live query engine
  (`SELECT 1` -> 1). It is stored only in the repo `.env` as `ZETARIS_API_KEY`; do not paste it
  into docs, commits or chat. Regenerate from the same page if it ever leaks.

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

BLOCKER, needs a human decision (infra-only cannot fix it): a cloud key (Meterless credit or
build.nvidia.com) or a local model download is required before `meterless/auto` can answer.
Eligibility wording says the product must run on Nemotron via Meterless OR the NVIDIA key, while
the gate also says Meterless must be running. The runtime now satisfies "running"; the provider
question decides whether `NEMOTRON_MODEL` is `meterless/auto` (Meterless credit) or
`nvidia/nemotron-3-super-120b-a12b` (Option B). Pick one, never mix them.

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

Option B — build.nvidia.com key, if Meterless cannot serve Nemotron:

```
MODEL_BASE_URL=https://integrate.api.nvidia.com/v1
MODEL_API_KEY=<build.nvidia.com key>
NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b
```

## 4. Repo `.env` (never committed)

```bash
cp .env.example .env      # repo root; backend/smoke_test.py loads it via python-dotenv
```

- Names are fixed by `docs/CONTRACTS.md`; renaming or adding one is a contract change.
- `ZETARIS_BASE_URL` is optional and defaults to `http://localhost:3000` (used by the smoke
  test only).
- Fill values, never commit `.env` (gitignore already covers it), never print secrets.

Pre-flight once Zetaris + the model route are up:

```bash
python backend/smoke_test.py     # from the repo root; expect PASS PASS PASS
```

## 5. Ports (infra documents reality)

| Service | Port | Owner |
|---|---|---|
| haqi backend | 8000 | backend |
| Zetaris UI | 3000 | infra |
| Zetaris REST | 8888 | infra |
| frontend dev server | 5173 | frontend |
| Zetaris JDBC | 10000 | infra |
| Meterless runtime | 8088 | infra |

Only the ports above are published; `8889` and the Spark UI are internal/local-only. Check what
is actually listening with `docker compose ps` (the `PORTS` column) before exposing anything.
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
key from `.env`, and the Meterless hotspot plus `/v1/models`. Secrets are read from `.env`
and never printed. Sample output on a good day:

```
  PASS  docker engine 29.9.2
  PASS  postgres: running (healthy)  ... driver, api, ui
  PASS  init: completed (exit 0)     PASS  bootstrap: completed (exit 0)
  PASS  ui: /api/config 200
  PASS  zetaris rest: SELECT 1 -> 1
  PASS  meterless: /healthz http://127.0.0.1:8088
  PASS  meterless: /v1/models 73 ids
  WARN  model route: meterless/auto has no provider - product answers fall back to the deterministic path

Infra is up, 1 warning(s). Read them before the demo.
```

A `WARN` on the model route is the honest state on 25 Oct: the hotspot is up but nothing serves
it, so `/v1/models` passes while a completion returns `400`. Pass means infra; the provider is
a separate credential (`§3`).

Autostart after a reboot (verified 25 Oct):

- Docker Desktop: `AutoStart` is `true` in `%APPDATA%\Docker\settings-store.json`, so the
  engine comes up at login. The four services are `restart: unless-stopped` and return on
  their own; `init` and `bootstrap` stay exited by design.
- Meterless: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nightshift Runtime.lnk`
  launches `meterless-runtime.exe`, which starts `meterlessd`. It takes a few seconds after
  login, so the first health check may be too early.
- The runtime token is regenerated when the daemon restarts, at
  `%LOCALAPPDATA%\ai.meterless.runtime\proxy-token`. `MODEL_API_KEY` in `.env` must be
  updated after every runtime restart or `/v1/models` answers `401` and healthcheck says
  "token rejected". Copy the value, do not paste it anywhere else.

WSL user: `najim` (uid 1000, member of `docker` only, no sudo) is the default for
`wsl -d Ubuntu`, set in `/etc/wsl.conf`. Run the vendor scripts as that user:

```bash
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/.../zetaris-platform && ./verify.sh'
```

`wsl -d Ubuntu -u root -- …` still works for one-off repairs; day-to-day work does not need
root and holding the Docker socket is enough.

### The recipe gate

Zetaris is verified, but the backend still cannot use it: `backend/app/adapters/zetaris.py`
raises until infra publishes a table whose first five columns are
`source_id, raw_value, unit, distance_km, observed_at`. `infra/zetaris/README.md` records
what is registered, what the engine supports, and the exact questions blocking a REST table.
Once a table exists:

```powershell
powershell -ExecutionPolicy Bypass -File infra\zetaris\check-recipe.ps1 -Table HAQI.AIR_QUALITY
```

Exit 0 means the recipe is publishable; the rules themselves are proven by `-SelfTest`.

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
| 25 Oct | Nightshift startup shortcut created; runtime still needs its token copied into `.env` after each start | done |
| 25 Oct | `infra/healthcheck.ps1`: 11 pass + 1 WARN (no model provider), no secrets printed | PASS |
| 25 Oct | `infra/zetaris/check-recipe.ps1`: 5 self-tests pass; live DESCRIBE against `NY_TAXI.customers` correctly rejected | PASS (no recipe yet) |
| 25 Oct | Confirmed grammar: `SHOW LIGHTNING DATABASES`, `SHOW LIGHTNING TABLES <DB>`, `SHOW TABLES IN <DB>`, `DESCRIBE <DB>.<TABLE>`; metastore has 0 REST tables, 0 datasources | recorded in `infra/zetaris/README.md` |
| 25 Oct | REST table registration path unproven: no UI wizard in this bundle, `CREATE LIGHTNING REST TABLE` rejected (empty 400), no OpenAPI | BLOCKED — question sent to coordinator |
| 25 Oct | `infra/backup.ps1` wrote dumps and restored both into throwaway databases, row counts matched | PASS (first drill, 185 + 10 tables) |
