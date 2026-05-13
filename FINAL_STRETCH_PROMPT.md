# פרומפט "ישורת אחרונה" — Botcraft / Viral Empire

הקשר: הסטאק (FastAPI :8000, Dashboard :3000, Worker, Redis, n8n :5678) רץ דרך docker-compose. בוצעו 12 שלבי פיתוח (ראה memory/project_botcraft_sprint.md). חסר רק: הפעלת מיגרציות ב-Supabase, וידוא שהאפליקציה עובדת end-to-end דרך הדפדפן, וליטוש UI על הפיצ'רים החדשים.

## משימות לישורת האחרונה

### 1. מיגרציות Supabase (קריטי — חוסם הכל)
ב-Supabase SQL editor, הריץ בסדר:
- `infra/migrations/006_main_extensions.sql` — מוסיף עמודות status/is_paused/auto_publish/avatar_style ל-avatars + טבלאות notifications/push_subscriptions/avatar_ideas/chat_messages
- `infra/migrations/007_persona_variants_and_insights.sql` — persona_variants/avatar_insights/script_consistency_checks

ללא זה: `POST /avatars/create` נופל עם PGRST204, `GET /notifications` נופל עם PGRST205, ה-Bell וה-Notifications page לא טוענים, וה-chat-bot לא יכול לשמור היסטוריה.

### 2. כניסה לאפליקציה ובדיקת end-to-end בדפדפן
פתח http://localhost:3000 ועבור כל זרימה:
- **Overview** — WeeklyCalendar, AlertsPanel, avatar breakdown, ChatWidget בתחתית
- **NewAvatarPanel** — 7 presets (gaming/fitness/news/comedy/tech/cooking/lifestyle), בורר style (realistic/anime/3d/cinematic/cartoon), צור אווטאר חדש ובדוק שמופיע ב-list
- **AvatarDetail** — Profile (auto_publish toggle, duplicate), Schedules (vacation mode), Ideas tab (add/use/delete), Insights, Variants
- **NotificationBell + /notifications** — בדוק SSE: צור אירוע (failure ב-orchestrator) ובדוק שה-Bell מתעדכן בזמן אמת
- **ChatWidget** — שלח "צור לי אווטאר על כדורגל" ובדוק שה-tool create_avatar מופעל

### 3. שיפורי UI על הפיצ'רים החדשים
- **NotificationBell**: וודא שהבאדג' עם המספר נקי בעיצוב, ודרופ-דאון עם empty state טוב
- **WeeklyCalendar**: גרסה ויזואלית (badges לאווטאר, לא רק שמות), מובייל-פרנדלי
- **ChatWidget**: action badges צבעוניים לפי tool, אנימציית "מקליד...", auto-scroll
- **Ideas tab**: state ריק יפה ("עדיין אין רעיונות — לחץ הוסף") + כפתור "צור רעיונות אוטומטית מהפרסונה"
- **AlertsPanel**: kbd shortcut למחיקה, קיבוץ לפי avatar
- **Variants page**: השוואת A/B צד-לצד עם metrics

### 4. Web Push (Phase 10 — נשאר חצי)
חסרים: VAPID key generation, `Notification.requestPermission()` בקליינט, שליחת push בפועל מ-`core/notify.py`. הוסף `pywebpush`, צור endpoint `/notifications/push/vapid-public-key`, וקרא ל-webpush.send_notification בכל notify().

### 5. בדיקות
- `pytest tests/` — אחרי המיגרציות צריך לעבור ירוק (כולל `test_smoke_backend.py`)
- `cd dashboard && npm install && npm test` — vitest
- בילד פרודקשן: `npm run build` ב-dashboard

### 6. Polish אחרון
- בדוק את כל ה-toast notifications — שלא יחסמו את ה-Bell
- וודא שה-SSE מתחבר מחדש בכשל רשת (reconnect logic ב-useNotificationsSSE)
- וודא שכל הקריאות ב-`dashboard/src/lib/api.js` משתמשות ב-`access_token` ולא `token`

## קריטריוני סיום
- [ ] מיגרציות 006+007 רצו ב-Supabase
- [ ] צור אווטאר חדש דרך ה-UI עובד
- [ ] התראה SSE מגיעה ל-Bell בזמן אמת
- [ ] Chat-bot מצליח להפעיל לפחות tool אחד
- [ ] `pytest -m smoke` ירוק
- [ ] `npm run build` עובר נקי
