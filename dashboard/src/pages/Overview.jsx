import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAnalytics, useRecentVideos, useColabHealth,
  useAvatars, useNotifications, useMutationWithToast,
} from '@/hooks/useApi'
import { useStore } from '@/store/useStore'
import { endpoints } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'
import { ChatWidget } from '@/components/ChatWidget'
import {
  Film, Send, Star, Users, Play, Activity,
  AlertTriangle, XCircle, CheckCircle2, RefreshCw, Bell, Calendar,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ===== Weekly schedule calendar =====

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TYPE_COLOR = {
  short: 'bg-primary/20 border-primary/40 text-primary',
  long: 'bg-success/20 border-success/40 text-success',
  post: 'bg-warning/20 border-warning/40 text-warning',
}
const TYPE_LABEL = { short: 'Short', long: 'Long', post: 'Post' }

function buildCalendarSlots(avatars) {
  // Returns: { sun: [{hour, minute, type, avatarName, isPaused}], mon: [...], ... }
  const result = Object.fromEntries(DAYS.map((d) => [d, []]))

  for (const av of avatars || []) {
    const defs = [
      { type: 'short', sched: av.short_video_schedule },
      { type: 'long', sched: av.long_video_schedule },
      { type: 'post', sched: av.post_schedule },
    ]
    for (const { type, sched } of defs) {
      if (!sched?.enabled) continue
      for (const slot of sched.times || []) {
        const entry = {
          hour: slot.hour ?? 9,
          minute: slot.minute ?? 0,
          type,
          avatarName: av.name || '?',
          isPaused: !!av.is_paused || av.status === 'paused',
        }
        if (slot.day === 'daily') {
          DAYS.forEach((d) => result[d].push(entry))
        } else if (result[slot.day]) {
          result[slot.day].push(entry)
        }
      }
    }
  }

  // Sort each day's slots by time
  for (const d of DAYS) {
    result[d].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  }
  return result
}

export function WeeklyCalendar({ avatars }) {
  const slots = buildCalendarSlots(avatars)
  const today = DAYS[new Date().getDay()]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="w-4 h-4 text-primary" /> Weekly schedule
          <span className="text-xs font-normal text-muted-foreground ml-1">Asia/Jerusalem</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 min-w-[560px] sm:min-w-0">
          {DAYS.map((day, i) => (
            <div key={day} className={cn('rounded-lg p-1.5', day === today && 'bg-primary/5 border border-primary/20')}>
              <div className={cn(
                'text-center text-[11px] font-semibold mb-1.5 pb-1 border-b border-border',
                day === today ? 'text-primary' : 'text-muted-foreground',
              )}>
                {DAY_LABELS[i]}
              </div>
              <div className="space-y-1 min-h-[60px]">
                {slots[day].length === 0 ? (
                  <div className="text-center text-[10px] text-muted-foreground/40 pt-2">—</div>
                ) : (
                  slots[day].map((s, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'rounded px-1 py-0.5 border text-[9px] leading-tight',
                        TYPE_COLOR[s.type],
                        s.isPaused && 'opacity-40 line-through',
                      )}
                      title={`${s.avatarName} · ${TYPE_LABEL[s.type]} @ ${String(s.hour).padStart(2,'0')}:${String(s.minute).padStart(2,'0')}${s.isPaused ? ' (paused)' : ''}`}
                    >
                      <div className="font-medium truncate">{String(s.hour).padStart(2,'0')}:{String(s.minute).padStart(2,'0')}</div>
                      <div className="truncate opacity-80">{s.avatarName}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
          {Object.entries(TYPE_LABEL).map(([t, l]) => (
            <div key={t} className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded border', TYPE_COLOR[t])}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />{l}
            </div>
          ))}
          <span className="ml-auto italic">strikethrough = paused avatar</span>
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({ icon: Icon, label, he, value, accent }) {
  return (
    <Card className="overflow-hidden hover:border-primary/40 smooth">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-[10px] text-muted-foreground/70 mb-2">{he}</div>
            <div className="text-3xl font-bold">{value ?? <Skeleton className="h-8 w-16" />}</div>
          </div>
          <div className={`w-10 h-10 rounded-md flex items-center justify-center ${accent}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const LEVEL_ICON = {
  error: <XCircle className="w-4 h-4 text-destructive shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />,
  success: <CheckCircle2 className="w-4 h-4 text-success shrink-0" />,
  info: <Bell className="w-4 h-4 text-blue-400 shrink-0" />,
}

export function AlertsPanel() {
  const { data: notifs, isLoading } = useNotifications({ limit: 20 })
  const markAll = useMutationWithToast(
    () => endpoints.notificationMarkAllRead(),
    { invalidate: ['notifications', 'notifications-unread-count'] },
  )
  const { setActivePage } = useStore()

  const alerts = (notifs || []).filter(
    (n) => !n.is_read && (n.level === 'error' || n.level === 'warning'),
  ).slice(0, 6)

  if (!isLoading && alerts.length === 0) return null

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-destructive text-base">
            <AlertTriangle className="w-4 h-4" /> Alerts requiring attention
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAll.mutate()}>
              Dismiss all
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setActivePage('notifications')}>
              View all
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          alerts.map((n) => (
            <div key={n.id} className="flex items-start gap-3 p-3 rounded-md bg-card border border-destructive/20">
              <div className="mt-0.5">{LEVEL_ICON[n.level] || LEVEL_ICON.info}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-1">{n.message}</div>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {timeAgo(n.created_at)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function Overview() {
  const { data: analytics } = useAnalytics(7)
  const { data: avatars } = useAvatars()
  const { data: recent, isLoading: loadingRecent } = useRecentVideos()
  const { refetch: refetchHealth, data: health } = useColabHealth()
  const { openProduceModal } = useStore()
  const [showHealth, setShowHealth] = useState(false)

  const stats = analytics?.summary || {}
  const activeAvatars = (avatars || []).filter((a) => a.status === 'active').length
  const pausedAvatars = (avatars || []).filter((a) => a.status === 'paused').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Overview</h2>
        <p className="text-sm text-muted-foreground">סקירה כללית — מה קורה בממלכה שלך</p>
      </div>

      {/* Failure alerts — only rendered when there are unread errors/warnings */}
      <AlertsPanel />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Film} label="Videos this week" he="סרטונים השבוע" value={stats.videos_count} accent="bg-primary/15 text-primary" />
        <StatCard icon={Send} label="Posts published" he="פרסומים" value={stats.posts_count} accent="bg-success/15 text-success" />
        <StatCard icon={Star} label="Avg viral score" he="ציון ויראליות ממוצע" value={stats.avg_score?.toFixed?.(1) ?? stats.avg_score} accent="bg-warning/15 text-warning" />
        <StatCard icon={Users} label="Active avatars" he="אווטארים פעילים" value={activeAvatars !== undefined ? `${activeAvatars}/${(avatars || []).length}` : undefined} accent="bg-primary/15 text-primary" />
      </div>

      {/* Weekly schedule calendar */}
      {(avatars || []).length > 0 && <WeeklyCalendar avatars={avatars} />}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Activity feed */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Activity feed
              </CardTitle>
              <span className="text-xs text-muted-foreground">פיד פעילות בזמן אמת</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[480px] overflow-y-auto">
            {loadingRecent ? (
              [...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : (recent || []).length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                No activity yet — לא הייתה פעילות עדיין
              </div>
            ) : (
              (recent || []).slice(0, 12).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-md bg-secondary/40 border border-border hover:border-primary/40 smooth"
                >
                  {item.face_url ? (
                    <img src={item.face_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                      {(item.avatar_name || '?')[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.topic || item.event || 'Pipeline event'}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.avatar_name} · {item.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === 'failed' && (
                      <Badge variant="destructive" className="text-[10px]">failed</Badge>
                    )}
                    {item.status === 'ready' && (
                      <Badge variant="success" className="text-[10px]">ready</Badge>
                    )}
                    {item.platform && (
                      <Badge variant="secondary" className="text-[10px]">{item.platform}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{timeAgo(item.created_at || item.updated_at)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Right panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <span className="text-xs text-muted-foreground">פעולות מהירות</span>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" onClick={() => openProduceModal()}>
                <Play className="w-4 h-4" /> Produce Video Now
                <span className="ml-auto text-xs opacity-70">הפק סרטון</span>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={async () => {
                  setShowHealth(true)
                  await refetchHealth()
                  toast({ title: 'Colab health checked', variant: 'success' })
                }}
              >
                <RefreshCw className="w-4 h-4" /> Check Colab Health
                <span className="ml-auto text-xs opacity-70">בדוק שרתים</span>
              </Button>

              {showHealth && health && (
                <div className="p-3 rounded-md bg-secondary/40 border border-border space-y-1.5 text-xs">
                  {Object.entries(health).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center">
                      <span className="capitalize text-muted-foreground">{k}</span>
                      <Badge variant={v?.ok ? 'success' : 'destructive'} className="text-[10px]">
                        {v?.ok ? 'OK' : 'DOWN'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Avatar breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Avatar breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(avatars || []).length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">No avatars yet</div>
              ) : (
                (avatars || []).slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded-md bg-secondary/40 border border-border">
                    {a.face_url ? (
                      <img src={a.face_url} alt={a.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {a.name?.[0] || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{a.name}</div>
                      <div className="text-[10px] text-muted-foreground">{a.niche}</div>
                    </div>
                    <Badge variant={a.status === 'active' ? 'success' : 'secondary'} className="text-[10px] shrink-0">
                      {a.status === 'active' ? 'active' : 'paused'}
                    </Badge>
                  </div>
                ))
              )}
              {(avatars || []).length > 5 && (
                <div className="text-xs text-muted-foreground text-center">
                  +{(avatars || []).length - 5} more
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Chat agent */}
      <ChatWidget />
    </div>
  )
}
