# BotCraft UI Integration Guide

**Merge the BotCraft UI Kit (design system) with our Serverless Infrastructure (Vercel + Supabase).**

---

## What You Have

### BotCraft UI Kit
- **Location:** `dashboard/src/pages/botcraft-ui-kit/`
- **Components:** Primitives, Sidebar, Topbar, Dashboard, AvatarsPage, VideosPage, etc.
- **Mock Data:** `mock.js` (MOCK.avatars, MOCK.videos, MOCK.insights)
- **Styling:** `colors_and_type.css` (CSS variables: --primary, --text, --bg, etc.)
- **State:** React hooks (useState, localStorage for lang toggle)

### Infrastructure (Already Built)
- **Vercel:** Dashboard hosting (auto-deploy on git push)
- **Supabase:** PostgreSQL DB + Edge Functions + Auth
- **API:** Fetch-based client (`dashboard/src/lib/api.js`)
- **Data:** avatars, videos, trend_signals, learning_facts tables

---

## Integration Strategy

### Phase 1: Connect UI to Real Data (2 hours)

**Goal:** Replace `mock.js` with Supabase queries.

#### 1a. Wrap BotCraft Components
Create `dashboard/src/BotCraftDashboard.jsx`:
```jsx
import { useQuery } from '@tanstack/react-query'
import { supabase } from './lib/api'

// Query avatars from Supabase
const { data: avatars } = useQuery({
  queryKey: ['avatars'],
  queryFn: async () => {
    const { data } = await supabase
      .from('avatars')
      .select('*')
      .order('created_at', { ascending: false })
    return data
  }
})

// Transform to mock.js format
const mockData = {
  avatars: avatars.map(a => ({
    id: a.id,
    name: a.name,
    niche: a.niche,
    videos: ..., // count
    views: ..., // from analytics
    growth: ...,
    status: a.is_paused ? 'paused' : 'active'
  }))
}

// Pass to UI Kit
return <App mockData={mockData} callbacks={{onCreateAvatar, onProduceVideo}} />
```

#### 1b. Wire Mutations
Connect create/update actions to Supabase:
```jsx
const createAvatarMutation = useMutation({
  mutationFn: async (data) => {
    // Call Edge Function
    const res = await fetch(`${API_URL}/create-avatar`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return res.json()
  }
})
```

#### 1c. Update BotCraft App.jsx
Modify to accept data + callbacks instead of mock:
```jsx
// OLD: const [avatars] = React.useState(window.MOCK.avatars)
// NEW:
const App = ({ mockData, callbacks }) => {
  const [avatars] = React.useState(mockData.avatars)
  // ... rest
}
```

### Phase 2: Styling & Theming (1 hour)

#### 2a. Move colors_and_type.css
Copy to dashboard:
```bash
cp dashboard/src/pages/botcraft-ui-kit/../../colors_and_type.css \
   dashboard/src/styles/botcraft-theme.css
```

#### 2b. Inject into index.html
```html
<link rel="stylesheet" href="/src/styles/botcraft-theme.css">
```

#### 2c. Verify CSS Variables
Check that all CSS vars are defined:
```css
:root {
  --primary: #7C3AED;
  --primary-glow: rgba(167,139,250,0.3);
  --text: #1F2937;
  --bg: #F9FAFB;
  --surface: #FFFFFF;
  --border: #E5E7EB;
  --font-body: ...; /* system or loaded font */
  --font-mono: monospace;
  --shadow-glow: ...;
}
```

### Phase 3: Auth & Realtime (1 hour)

#### 3a. Add Supabase Auth
```jsx
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user)
  })

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
    setUser(session?.user)
  })

  return () => subscription?.unsubscribe()
}, [])
```

#### 3b. Realtime Updates (Optional)
Subscribe to changes:
```jsx
useEffect(() => {
  const channel = supabase
    .channel('avatars')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'avatars' }, (payload) => {
      setAvatars(prev => [...prev, payload.new])
    })
    .subscribe()

  return () => supabase.removeChannel(channel)
}, [])
```

### Phase 4: Deploy (30 min)

#### 4a. Update package.json
Already has `@supabase/supabase-js` — ✅ done

#### 4b. Set Environment Variables (Vercel)
```
VITE_API_URL=https://your-project.supabase.co/functions/v1
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

#### 4c. Deploy
```bash
git push origin main  # Vercel auto-deploys
```

---

## File Structure After Integration

```
dashboard/
├── src/
│   ├── BotCraftDashboard.jsx    # ← New: integration wrapper
│   ├── pages/
│   │   └── botcraft-ui-kit/     # ← BotCraft UI Kit (copied)
│   │       ├── index.html
│   │       ├── App.jsx          # ← Modified to accept props
│   │       ├── Primitives.jsx
│   │       ├── Sidebar.jsx
│   │       ├── Topbar.jsx
│   │       ├── Dashboard.jsx
│   │       ├── AvatarsPage.jsx
│   │       ├── VideosPage.jsx
│   │       ├── mock.js          # ← Deprecated (replaced by queries)
│   │       └── ...
│   ├── lib/
│   │   └── api.js               # ← Supabase client (already updated)
│   ├── styles/
│   │   └── botcraft-theme.css   # ← CSS variables
│   └── ...
├── package.json
└── vite.config.js
```

---

## Component Communication Flow

```
BotCraftDashboard.jsx (data + callbacks)
    ↓
App.jsx (receives mockData prop, renders pages)
    ├─ Sidebar → page nav
    ├─ Topbar → search, notifications
    ├─ Dashboard → KPI tiles, recent videos, schedule
    ├─ AvatarsPage → grid of avatar cards
    ├─ VideosPage → video table
    └─ ...

On action (create avatar, produce video):
    ↓
Callback fires → useMutation → Edge Function → Supabase
    ↓
Query re-runs → UI updates
```

---

## Data Transformation Cheat Sheet

**Mock to Real:**

```js
// Mock
MOCK.avatars[0] = {
  id: 'a1',
  name: 'TechTom',
  niche: 'tech',
  videos: 34,
  views: '248K',
  growth: '+18%'
}

// Real (from Supabase)
avatars[0] = {
  id: 'uuid',
  name: 'TechTom',
  niche: 'tech',
  is_paused: false,
  created_at: '2026-05-08T...'
}

// Transform
mockData.avatars[0] = {
  ...real,
  videos: videos.filter(v => v.avatar_id === real.id).length,
  views: '0', // TODO: query analytics
  growth: '+0%', // TODO: query analytics
  status: real.is_paused ? 'paused' : 'active'
}
```

---

## Testing Checklist

- [ ] Auth: Sign in via Google
- [ ] Avatars load from Supabase
- [ ] Create new avatar → persists in DB
- [ ] Produce video → job queued
- [ ] Videos table shows pending/done status
- [ ] Language toggle (EN/HE) works
- [ ] Sidebar collapse/expand works
- [ ] Notifications badge shows count
- [ ] Realtime: new video appears without refresh

---

## Next Steps

1. **Implement Phase 1** (2h) — Connect UI to Supabase queries
2. **Verify styling** (1h) — Colors, fonts, spacing match BotCraft
3. **Test auth** (30m) — Sign in, sign out, session persist
4. **Deploy** (30m) — Push to Vercel, check Supabase Edge Functions
5. **Monitor** — Check Vercel logs, Supabase error logs

---

## Known Issues & Solutions

| Issue | Solution |
|-------|----------|
| **Analytics data (views, growth) not available** | Add analytics aggregation query later, for now hardcode `'0'` |
| **Mock images/avatars missing** | Use gradient backgrounds or Pollinations API |
| **RTL text layout bugs** | Test with Hebrew strings, adjust padding/margins |
| **Font loading** | Ensure `colors_and_type.css` loads custom fonts or fallback to system |
| **Cold start delay** | Edge Functions will be slow on first call; subsequent calls are cached |

---

## Rollback Plan

If something breaks:
1. Revert BotCraft components to mock mode: `const mockData = window.MOCK`
2. Dashboard still works with hardcoded data
3. Gradually re-enable Supabase queries one component at a time

---

## Support

- Questions on BotCraft components? Check `botcraft-ui-kit/README.md`
- Questions on Supabase integration? Check `DEPLOY.md` or `ARCHITECTURE.md`
- Want to customize styling? Edit `colors_and_type.css` or override in React inline styles

---

**Ready to integrate? Start with Phase 1!** 🚀
