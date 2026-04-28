import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfig, useMutationWithToast } from '@/hooks/useApi'
import { endpoints } from '@/lib/api'
import {
  Eye, EyeOff, Save, TestTube, AlertTriangle, Download, RefreshCw,
  CheckCircle2, XCircle, Activity, Bell, BellRing, BellOff,
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

function Section({ title, he, description, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{he} {description && `· ${description}`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function MaskedInput({ value, onChange, label }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <Input type={show ? 'text' : 'password'} value={value || ''} onChange={onChange} placeholder="••••••••" />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ===== System Health (Part I) =====
// משיכת /admin/diagnostics כל 30 שניות, צבע מותאם לסטטוס, רשימת 10 שגיאות אחרונות.
function SystemHealthSection() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: async () => (await endpoints.diagnostics()).data,
    refetchInterval: 30_000,
  })

  const StatusBadge = ({ ok, label }) => (
    <div className="flex items-center justify-between p-2 rounded bg-secondary/40 border border-border">
      <span className="text-sm">{label}</span>
      <Badge variant={ok ? 'success' : 'destructive'}>
        {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {ok ? 'OK' : 'Down'}
      </Badge>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" /> System Health
            </CardTitle>
            <CardDescription>בריאות המערכת — רענון אוטומטי כל 30 שניות</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={isRefetching ? 'animate-spin w-4 h-4' : 'w-4 h-4'} />
            Run check
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <StatusBadge ok={!!data?.database?.ok} label="Database (Supabase)" />
              <StatusBadge ok={!!data?.redis?.ok} label="Redis" />
              <StatusBadge ok={!!data?.colab?.tts?.ok} label="Colab TTS" />
              <StatusBadge ok={!!data?.colab?.image?.ok} label="Colab Image" />
              <StatusBadge ok={!!data?.colab?.lipsync?.ok} label="Colab Lipsync" />
              <StatusBadge ok={!!data?.scheduler?.running} label="Scheduler" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div className="p-2 rounded bg-secondary/40 border border-border">
                <div className="text-xs text-muted-foreground">Queue size</div>
                <div className="text-lg font-semibold">{data?.queue_size ?? 0}</div>
              </div>
              <div className="p-2 rounded bg-secondary/40 border border-border">
                <div className="text-xs text-muted-foreground">Failed (24h)</div>
                <div className="text-lg font-semibold">{data?.failed_jobs_24h ?? 0}</div>
              </div>
              <div className="p-2 rounded bg-secondary/40 border border-border">
                <div className="text-xs text-muted-foreground">LLM quota left</div>
                <div className="text-lg font-semibold">
                  {data?.llm_quota?.remaining ?? '—'}/{data?.llm_quota?.daily_limit ?? '—'}
                </div>
              </div>
            </div>

            <div>
              <Label>Recent errors (last 10)</Label>
              {(data?.recent_errors || []).length === 0 ? (
                <div className="text-sm text-muted-foreground py-3 text-center">
                  No recent errors — אין שגיאות אחרונות
                </div>
              ) : (
                <div className="space-y-1 mt-2 max-h-60 overflow-y-auto">
                  {data.recent_errors.map((e, i) => (
                    <div key={i} className="p-2 rounded bg-destructive/10 border border-destructive/30 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono">{e.stage || 'unknown'}</span>
                        <span className="text-muted-foreground">
                          {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-foreground/80">{e.reason || e.message || '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

function WebPushSection() {
  const [permission, setPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  // Check existing subscription on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub))
    )
  }, [])

  const enable = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast({ title: 'Push not supported in this browser', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        toast({ title: 'Permission denied', variant: 'destructive' })
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        toast({ title: 'VITE_VAPID_PUBLIC_KEY not set', variant: 'destructive' })
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const subJson = sub.toJSON()
      await endpoints.notificationsPushSubscribe({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      })

      setSubscribed(true)
      toast({ title: 'Push notifications enabled', variant: 'success' })
    } catch (err) {
      toast({ title: 'Failed to enable push', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await endpoints.notificationsPushUnsubscribe({ endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setSubscribed(false)
      toast({ title: 'Push notifications disabled', variant: 'success' })
    } catch (err) {
      toast({ title: 'Failed to disable push', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="w-5 h-5" /> Browser Push Notifications
        </CardTitle>
        <CardDescription>Web Push — התראות ישירות לדפדפן גם כשהחלון סגור</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported ? (
          <div className="text-sm text-muted-foreground">הדפדפן הזה אינו תומך ב-Push Notifications.</div>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 rounded bg-secondary/40 border border-border">
              <div>
                <div className="text-sm font-medium">Permission status</div>
                <div className="text-xs text-muted-foreground">
                  {permission === 'granted' ? 'Granted — מאושר' : permission === 'denied' ? 'Denied — חסום' : 'Not requested — לא נשאל'}
                </div>
              </div>
              <Badge variant={permission === 'granted' ? 'success' : permission === 'denied' ? 'destructive' : 'secondary'}>
                {permission}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded bg-secondary/40 border border-border">
              <div>
                <div className="text-sm font-medium">Subscription</div>
                <div className="text-xs text-muted-foreground">
                  {subscribed ? 'Active — מנוי פעיל' : 'Inactive — לא מנוי'}
                </div>
              </div>
              <Badge variant={subscribed ? 'success' : 'secondary'}>{subscribed ? 'Active' : 'Inactive'}</Badge>
            </div>
            {permission === 'denied' ? (
              <div className="text-xs text-muted-foreground p-2 rounded bg-destructive/10 border border-destructive/30">
                ההרשאה חסומה בדפדפן — פתח את הגדרות הדפדפן כדי לאפשר מחדש.
              </div>
            ) : subscribed ? (
              <Button variant="outline" onClick={disable} disabled={loading} className="w-full">
                <BellOff className="w-4 h-4" />
                {loading ? 'Disabling…' : 'Disable Push Notifications'}
              </Button>
            ) : (
              <Button onClick={enable} disabled={loading} className="w-full">
                <BellRing className="w-4 h-4" />
                {loading ? 'Enabling…' : 'Enable Push Notifications'}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function Settings() {
  const { data, isLoading } = useConfig()
  const { data: colabUrls } = useQuery({
    queryKey: ['colab-urls'],
    queryFn: async () => (await endpoints.colabUrlsGet()).data,
  })

  const [form, setForm] = useState({
    colab_tts_url: '',
    colab_image_url: '',
    colab_lipsync_url: '',
    groq_api_key: '',
    gemini_api_key: '',
    cerebras_api_key: '',
    notify_on_video_ready: true,
    notify_on_post_published: true,
    notify_on_pipeline_failure: true,
  })

  useEffect(() => {
    if (data) setForm((f) => ({ ...f, ...data }))
  }, [data])

  // טעינת Colab URLs מ-Redis (admin/colab-urls) — דורסים את הערכים מ-config אם קיימים
  useEffect(() => {
    if (colabUrls) {
      setForm((f) => ({
        ...f,
        colab_tts_url: colabUrls.tts || f.colab_tts_url,
        colab_image_url: colabUrls.image || f.colab_image_url,
        colab_lipsync_url: colabUrls.lipsync || f.colab_lipsync_url,
      }))
    }
  }, [colabUrls])

  const save = useMutationWithToast(
    (data) => endpoints.configUpdate(data),
    { successMsg: 'Settings saved', invalidate: ['config'] },
  )

  const saveColab = useMutationWithToast(
    (data) => endpoints.colabUrlsSet(data),
    { successMsg: 'Colab URLs saved (live in Redis)', invalidate: ['colab-urls', 'colab-health', 'diagnostics'] },
  )

  const testServer = async (url, name) => {
    if (!url) return toast({ title: 'No URL set', variant: 'destructive' })
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/health`)
      toast({ title: `${name}: ${r.ok ? 'OK' : 'FAIL'}`, variant: r.ok ? 'success' : 'destructive' })
    } catch (e) {
      toast({ title: `${name}: unreachable`, variant: 'destructive' })
    }
  }

  const pauseAll = useMutationWithToast(
    () => endpoints.pauseAll(),
    { successMsg: 'All avatars paused', invalidate: ['avatars'] },
  )

  const clearQueue = useMutationWithToast(
    () => endpoints.clearQueue(),
    { successMsg: 'Redis queue cleared' },
  )

  const exportData = async () => {
    try {
      const r = await endpoints.exportData()
      const blob = new Blob([r.data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `viral-empire-export-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'Export downloaded', variant: 'success' })
    } catch (e) {
      toast({ title: 'Export failed', description: e?.userMessage, variant: 'destructive' })
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }))

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">הגדרות — תצורת המערכת</p>
      </div>

      <SystemHealthSection />

      <Section title="Colab Servers" he="שרתי Colab" description="GPU runtime endpoints — saved live to Redis">
        {[
          ['colab_tts_url', 'TTS server URL', 'TTS'],
          ['colab_image_url', 'Image server URL', 'Image'],
          ['colab_lipsync_url', 'Lipsync server URL', 'Lipsync'],
        ].map(([k, label, name]) => (
          <div key={k} className="flex items-end gap-2">
            <div className="flex-1">
              <Label>{label}</Label>
              <Input value={form[k] || ''} onChange={set(k)} placeholder="https://..." />
            </div>
            <Button variant="outline" size="sm" onClick={() => testServer(form[k], name)}>
              <TestTube className="w-3 h-3" /> Test
            </Button>
          </div>
        ))}
        <Button onClick={() => saveColab.mutate({
          tts: form.colab_tts_url,
          image: form.colab_image_url,
          lipsync: form.colab_lipsync_url,
        })}>
          <Save className="w-4 h-4" /> Save URLs
        </Button>
      </Section>

      <Section title="API Keys" he="מפתחות API">
        <MaskedInput label="Groq API Key" value={form.groq_api_key} onChange={set('groq_api_key')} />
        <MaskedInput label="Gemini API Key" value={form.gemini_api_key} onChange={set('gemini_api_key')} />
        <MaskedInput label="Cerebras API Key" value={form.cerebras_api_key} onChange={set('cerebras_api_key')} />
        <Button onClick={() => save.mutate({ groq_api_key: form.groq_api_key, gemini_api_key: form.gemini_api_key, cerebras_api_key: form.cerebras_api_key })}>
          <Save className="w-4 h-4" /> Save Keys
        </Button>
      </Section>

      <Section title="Notifications" he="התראות" description="in-app bell + browser push">
        <div className="flex items-center gap-2 p-3 rounded bg-secondary/40 border border-border text-sm text-muted-foreground">
          <Bell className="w-4 h-4 shrink-0" />
          התראות מועברות בזמן אמת דרך הפעמון בסרגל — ניתן גם להפעיל Push Notifications בדפדפן.
        </div>
        <div className="space-y-2 pt-2">
          {[
            ['notify_on_video_ready', 'Notify on video ready', 'התראה כשסרטון מוכן'],
            ['notify_on_post_published', 'Notify on post published', 'התראה בעת פרסום'],
            ['notify_on_pipeline_failure', 'Notify on pipeline failure', 'התראה בכשל'],
          ].map(([k, label, he]) => (
            <div key={k} className="flex items-center justify-between p-2 rounded bg-secondary/40 border border-border">
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{he}</div>
              </div>
              <Switch checked={!!form[k]} onCheckedChange={(v) => setForm((f) => ({ ...f, [k]: v }))} />
            </div>
          ))}
        </div>
        <Button onClick={() => save.mutate({
          notify_on_video_ready: form.notify_on_video_ready,
          notify_on_post_published: form.notify_on_post_published,
          notify_on_pipeline_failure: form.notify_on_pipeline_failure,
        })}>
          <Save className="w-4 h-4" /> Save Notifications
        </Button>
      </Section>

      <WebPushSection />

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Danger Zone
          </CardTitle>
          <CardDescription>אזור מסוכן — פעולות בלתי הפיכות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded bg-destructive/10 border border-destructive/30">
            <div>
              <div className="font-medium text-sm">Pause all avatars</div>
              <div className="text-xs text-muted-foreground">Stops all production immediately</div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => { if (confirm('Pause ALL avatars?')) pauseAll.mutate() }}>
              Pause All
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded bg-destructive/10 border border-destructive/30">
            <div>
              <div className="font-medium text-sm">Clear Redis queue</div>
              <div className="text-xs text-muted-foreground">Drops every queued job</div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => { if (confirm('Clear Redis queue?')) clearQueue.mutate() }}>
              Clear Queue
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded bg-secondary/40 border border-border">
            <div>
              <div className="font-medium text-sm">Export all data</div>
              <div className="text-xs text-muted-foreground">Download full JSON backup</div>
            </div>
            <Button variant="outline" size="sm" onClick={exportData}>
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
