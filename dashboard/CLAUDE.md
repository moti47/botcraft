# Dashboard — frontend guide

React + Vite UI for the Viral Empire backend. Talks to the FastAPI service at `VITE_API_URL` (defaults to `http://fastapi:8000` inside docker compose, `http://localhost:8000` for local dev).

The repo-root [CLAUDE.md](../CLAUDE.md) covers the full system. This file is dashboard-specific.

## Stack
- **React 18** + **Vite 5** (no TypeScript — JSX with `jsconfig.json`)
- **TanStack Query 5** for server state
- **Zustand 5** for client state (single store: `src/store/useStore.js`)
- **Radix UI** primitives wrapped into a local component library under `src/components/ui/`
- **Tailwind** + `tailwind-merge` + `class-variance-authority` + `tailwindcss-animate`
- **Axios** for HTTP, **Recharts** for charts, **lucide-react** for icons

## Layout — `src/`

- `main.jsx`, `App.jsx`, `index.css` — entry, router, global styles
- `pages/` — top-level routes:
  - `Overview.jsx`, `Avatars.jsx`, `AvatarDetail.jsx` (6-tab view: profile/platforms/schedules/commands/files/activity), `Videos.jsx`, `Trends.jsx`, `Analytics.jsx`, `Settings.jsx`
- `components/`
  - `layout/` — `Sidebar.jsx`, `TopBar.jsx`
  - `modals/` — `NewAvatarPanel.jsx`, `EditDnaPanel.jsx`, `ProduceVideoModal.jsx`, `VideoDetailModal.jsx`
  - `ui/` — Radix-based primitives: button, card, dialog, input, label, progress, select, sheet, skeleton, switch, table, tabs, textarea, toast, toaster, badge, use-toast
- `store/useStore.js` — Zustand global store
- `hooks/useApi.js` — TanStack Query hooks wrapping the Axios client
- `lib/api.js` — Axios instance + endpoint helpers
- `lib/utils.js` — `cn()` (clsx + tailwind-merge) and shared helpers

## Conventions

- **Adding a route**: create the page in `pages/`, register it in `App.jsx`, add a sidebar entry in `components/layout/Sidebar.jsx`.
- **Adding a UI primitive**: drop the Radix-wrapped component in `components/ui/` following the pattern of existing files (forwardRef + `cn(...)` for class merging + `cva` if it has variants).
- **Server state goes in TanStack Query** (`hooks/useApi.js`). **Client-only UI state goes in Zustand** (`store/useStore.js`). Don't duplicate.
- **API calls**: extend `lib/api.js` rather than calling axios from components. Hooks in `useApi.js` consume those helpers.
- **Imports**: relative (`../components/ui/button`) — no path aliases configured.
- **Styling**: Tailwind classes, merge with `cn()`. The `ui/` components already handle variant merging.

## Running

```bash
cd dashboard
npm install
npm run dev      # vite on 0.0.0.0:3000
```

Or via docker compose from the repo root: `docker compose up dashboard` (the `viral_dashboard` container).
