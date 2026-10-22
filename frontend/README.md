# haqi frontend

Offline-first UI for Ask / Today / Why? — renders local fixtures by default.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | TypeScript only |
| `npm run preview` | Preview production build |

## Fixtures switch

`src/api/index.ts` is the only data boundary.

- Default: `VITE_USE_FIXTURES` is on → reads `fixtures/*.json`
- Live backend later: `VITE_USE_FIXTURES=false VITE_API_BASE=http://localhost:8000 npm run dev`
