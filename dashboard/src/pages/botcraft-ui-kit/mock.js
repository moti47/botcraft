// BotCraft mock data

window.MOCK = {
  avatars: [
    { id: 'a1', name: 'TechTom', niche: 'tech', lang: 'EN', initial: 'T', grad: 'linear-gradient(135deg,#7C3AED,#06B6D4)', videos: 34, views: '248K', growth: '+18%', status: 'active' },
    { id: 'a2', name: 'Calm Clara', niche: 'wellness', lang: 'EN', initial: 'C', grad: 'linear-gradient(135deg,#06B6D4,#10B981)', videos: 22, views: '89K', growth: '+7%', status: 'active' },
    { id: 'a3', name: 'Comedy Carl', niche: 'humor', lang: 'HE', initial: 'ק', grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', videos: 18, views: '156K', growth: '+42%', status: 'paused' },
    { id: 'a4', name: 'FitFiona', niche: 'fitness', lang: 'EN', initial: 'F', grad: 'linear-gradient(135deg,#EF4444,#7C3AED)', videos: 41, views: '312K', growth: '+24%', status: 'active' },
  ],
  kpis: [
    { label: 'Total avatars', value: '12', delta: '+2 this month', spark: [4,6,5,8,7,9,10,12] },
    { label: 'Videos this month', value: '147', delta: '+24%', spark: [60,72,80,95,110,120,135,147], gradient: true },
    { label: 'Total views', value: '1.28M', delta: '+18%', spark: [800,870,920,1000,1080,1140,1220,1280] },
    { label: 'Active schedules', value: '38', delta: '+5', spark: [22,26,28,30,32,34,36,38] },
  ],
  videos: [
    { id: 'v1', title: 'Why GPUs broke the internet', avatar: 'TechTom', status: 'posted', step: 5, views: '24.1K', platforms: ['yt','tt'], thumb: 'linear-gradient(135deg,#7C3AED,#06B6D4)', created: '2h ago' },
    { id: 'v2', title: 'Morning breath sequence', avatar: 'Calm Clara', status: 'rendering', step: 4, views: '—', platforms: ['ig'], thumb: 'linear-gradient(135deg,#06B6D4,#10B981)', created: '5m ago' },
    { id: 'v3', title: 'Hot take: typing speed', avatar: 'Comedy Carl', status: 'queued', step: 1, views: '—', platforms: ['tt'], thumb: 'linear-gradient(135deg,#F59E0B,#EF4444)', created: '12m ago' },
    { id: 'v4', title: '5-min HIIT for desk warriors', avatar: 'FitFiona', status: 'posted', step: 5, views: '47.8K', platforms: ['yt','tt','ig'], thumb: 'linear-gradient(135deg,#EF4444,#7C3AED)', created: '6h ago' },
    { id: 'v5', title: 'The Rust hype, decoded', avatar: 'TechTom', status: 'ready', step: 5, views: '—', platforms: [], thumb: 'linear-gradient(135deg,#7C3AED,#A78BFA)', created: '1h ago' },
    { id: 'v6', title: 'Box breathing in 60s', avatar: 'Calm Clara', status: 'failed', step: 3, views: '—', platforms: [], thumb: 'linear-gradient(135deg,#94A3B8,#64748B)', created: '3h ago' },
  ],
  schedule: [
    { time: '09:00', avatar: 'Calm Clara', type: 'Post', platform: 'IG', kind: 'post' },
    { time: '12:30', avatar: 'TechTom', type: 'Short', platform: 'TikTok', kind: 'short' },
    { time: '15:00', avatar: 'FitFiona', type: 'Short', platform: 'YouTube', kind: 'short' },
    { time: '19:00', avatar: 'TechTom', type: 'Post', platform: 'IG', kind: 'post' },
    { time: '21:30', avatar: 'Comedy Carl', type: 'Short', platform: 'TikTok', kind: 'short' },
  ],
  insights: [
    { text: "Your avatar TechTom performs 2.3× better when posting at 7 PM", confidence: 87 },
    { text: "Hooks starting with a question get 34% more views across all avatars", confidence: 92 },
    { text: "Cyan-dominant thumbnails outperform purple by 18% on TikTok", confidence: 71 },
  ],
  perfBars: [
    { name: 'FitFiona', value: 312 },
    { name: 'TechTom', value: 248 },
    { name: 'Comedy Carl', value: 156 },
    { name: 'Calm Clara', value: 89 },
  ],
  notifications: 3,
};

window.STRINGS = {
  EN: {
    nav: { dashboard: 'Dashboard', avatars: 'Avatars', videos: 'Videos', trends: 'Trends', analytics: 'Analytics', learnings: 'Learnings', settings: 'Settings' },
    quickCreate: 'Quick create', search: 'Search avatars, videos, trends…',
    todaySchedule: "Today's schedule", recentVideos: 'Recent videos',
    avatarPerf: 'Avatar performance', insights: 'AI insights of the week',
    loginTitle: 'Welcome back', loginSub: 'Craft AI personas that create, post, and grow on autopilot.',
    email: 'Email', password: 'Password', signIn: 'Sign in', orContinue: 'or continue with',
    google: 'Continue with Google',
    newAvatar: 'New avatar', viewAll: 'View all',
  },
  HE: {
    nav: { dashboard: 'לוח בקרה', avatars: 'אווטארים', videos: 'סרטונים', trends: 'מגמות', analytics: 'ניתוחים', learnings: 'תובנות', settings: 'הגדרות' },
    quickCreate: 'יצירה מהירה', search: 'חפש אווטארים, סרטונים, מגמות…',
    todaySchedule: 'הלו״ז של היום', recentVideos: 'סרטונים אחרונים',
    avatarPerf: 'ביצועי אווטארים', insights: 'תובנות בינה מלאכותית השבוע',
    loginTitle: 'ברוך שובך', loginSub: 'בנה דמויות AI שיוצרות, מפרסמות וצומחות באוטומט.',
    email: 'אימייל', password: 'סיסמה', signIn: 'כניסה', orContinue: 'או המשך עם',
    google: 'המשך עם Google',
    newAvatar: 'אווטאר חדש', viewAll: 'הצג הכול',
  }
};
