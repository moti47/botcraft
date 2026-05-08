# BotCraft UI Kit

Click-through recreation of the BotCraft dashboard. Open `index.html` and click around — you can sign in (mock), navigate the sidebar, hover/focus avatar cards, open the video detail modal, and toggle the language pill (EN/HE).

## Files

- `index.html` — entry; mounts the React app, loads CSS + components
- `App.jsx` — top-level shell, routing state, mock data, language store
- `Sidebar.jsx` — left nav with collapsible state, language toggle, profile chip
- `Topbar.jsx` — search, notifications, Quick Create gradient CTA
- `LoginScreen.jsx` — split-layout login with animated gradient blob
- `Dashboard.jsx` — KPI tiles, recent videos, schedule timeline, AI insights
- `AvatarsPage.jsx` — grid of avatar cards + filter bar
- `VideosPage.jsx` — videos table with pipeline progress dots
- `VideoModal.jsx` — fullscreen modal with player + tabs
- `Primitives.jsx` — Button, Badge, Card, StatTile, PipelineProgress, AIBadge, etc.
- `mock.js` — avatars, videos, KPIs, insights

## Notes

- React 18 + Babel inline (no build).
- Lucide icons via inline SVGs (consistent with the design system's icon notes).
- All copy honors the content rules (sentence case, you/AI voice, ✨ for AI).
- The language toggle flips display strings to Hebrew and sets `dir="rtl"` on `<html>`. Not every string is translated — focused subset for demo.
