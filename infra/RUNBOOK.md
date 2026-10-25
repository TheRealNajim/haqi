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

## 6. Backup and recovery

The expensive state is not the containers — it is `zetaris_pgdata` (metastore, accounts, audit,
registered sources) and the `.env` that holds the keypair password. Restarting is free; losing
those is not.

```bash
# Cold backup: stop services but keep volumes, then archive the volume and the bundle .env
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

## 7. Troubleshooting

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

## 8. Status

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
