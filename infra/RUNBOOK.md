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

Windows specifics:

- Docker Desktop must use the WSL2 backend. `preflight.sh` and `verify.sh` are bash, so run
  them from a Linux distro, not PowerShell: `wsl --install -d Ubuntu` (once), then open
  Ubuntu and `cd /mnt/c/.../zetaris-platform`.
- `docker compose pull/up/ps/logs` work fine from PowerShell; only the two shell scripts need bash.
- Memory counts what Docker Desktop is allowed to use, not the laptop's RAM:
  Settings > Resources > Memory.

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

`ZETARIS_API_KEY`: issue it from the admin account in the Zetaris UI and paste it into the
repo `.env`. TODO(infra): record the exact menu path on 2.4.3 the first time we do it.

## 3. Meterless and the Nemotron route

Option A — Meterless runtime on this PC (the hackathon route). Meterless for Windows ships as
the Nightshift runtime app (Windows 10/11 64-bit, dedicated GPU: CUDA on NVIDIA, Vulkan on
others): <https://www.meterless.ai/windows.html>.

Once it runs, it is an OpenAI-compatible hotspot on `http://127.0.0.1:8088/v1`:

```bash
# is the process up? (does not prove the model route works)
curl -s http://127.0.0.1:8088/healthz

# the real check: 200 with model ids = online, 401/403 = token needed,
# anything else = offline. Read the ids from here and use one verbatim.
curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:8088/v1/models
```

- The runtime writes its token to `<stateDir>/proxy-token`; the app also shows it / offers a
  connect link (`http://<host>:<port>/connect#k=<key>`). Treat it like any other secret.
- Requests carry `Authorization: Bearer <token>`, `meterless-app: haqi`, and
  `meterless-scope: user` on chat calls.
- Model ids are routing modes (`meterless/auto`, `meterless/fast`, `meterless/deep`,
  `meterless/cheap`, `meterless/local`, `meterless/fusion`) and may include model-shaped ids.
  Use exactly what `/v1/models` returns for `NEMOTRON_MODEL`.
- Auto-detect scans ports 8088, 8090, 8787, 11434 on localhost.

Known gap: the "one route" rule applies to Meterless and NVIDIA — if the Gateway needs the
key from the Zetaris download page or the Meterless app needs activation, record the step
here the moment it is known. Do not mix routes.

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

## 6. Troubleshooting

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

## 7. Status

| Date | What | Result |
|---|---|---|
| 22 Oct | `zetaris-platform.zip` downloaded, extracted, registry login stored | done |
| 23 Oct | Docker 29.9.2, Compose 5.6.0, 7.5 GB / 20 CPU / ~950 GB free | PASS (memory WARN) |
| 23 Oct | `docker compose pull` (UI + API cached; driver layers in flight) | in progress |
| 23 Oct | ACR resolves to `r0922eus-2-az.eastus.cloudapp.azure.com` (East US), ~1.2 s TLS RTT, ~65 KB/s while a container download from the same Docker VM does ~1.4 MB/s | route bottleneck, see troubleshooting |
| — | `verify.sh` 9/9 + sample query | pending pull |
| — | Meterless runtime installed, `/v1/models` online | pending |
| — | `smoke_test.py` 3x PASS, values shared with backend lead | pending |
