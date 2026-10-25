# haqi frontend

Environmental risk dashboard ("World Risk Map") built as a single-page React app.

## Data modes

The app has one switch, `VITE_USE_FIXTURES` (see `.env.example` and `src/lib/api.ts`):

| Mode | How | What renders |
| --- | --- | --- |
| Live | default (dev and production) | Backend verdicts from `POST /ask` |
| Offline | `VITE_USE_FIXTURES=true` | Deterministic fixtures, labelled demo data |

In development, calls go to relative `/api/*` and Vite proxies them to the API,
so local work does not depend on CORS. `VITE_API_BASE_URL` is ignored in dev for
exactly that reason — set `VITE_API_PROXY_TARGET` to point the proxy elsewhere.
In production the client calls `https://haqi-api.onrender.com` directly (override
with `VITE_API_BASE_URL`).

**No provider keys belong in the frontend.** Vite inlines `VITE_*` variables
into the public bundle; the backend holds all credentials.

Live answers render the backend `Verdict`:
- `reason` and evidence `claim` strings are shown verbatim,
- `fallback: true` gets an honest demo-data banner,
- `blind_spots` render as disclosure chips,
- `aqi: null` shows “no current reading”, never zero.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:8080

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run the Vitest suite |
| `npm run lint` | ESLint + Prettier checks |

## Stack

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 4 (with shadcn/ui components on Radix primitives)
- Vitest, ESLint, Prettier
