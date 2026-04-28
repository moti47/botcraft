import { useState } from 'react'
import { useColabHealth, useLLMUsage, useUnreadCount, useNotifications, useMutationWithToast } from '@/hooks/useApi'
import { Activity, Mic, Image as ImageIcon, Video, Bell, Check, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { endpoints } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function StatusDot({ ok, label, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/50 border border-border">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-xs font-medium">{label}</span>
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          ok === null ? 'bg-muted-foreground/40' : ok ? 'bg-success animate-pulse-soft' : 'bg-destructive',
        )}
      />
    </div>
  )
}

const LEVEL_COLOR = {
  info: 'text-blue-400',
  success: 'text-success',
  warning: 'text-yellow-400',
  error: 'text-destructive',
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { setActivePage } = useStore()
  const { data: countData } = useUnreadCount()
  const { data: recent } = useNotifications({ limit: 6 })
  const count = countData?.count ?? 0

  const markAll = useMutationWithToast(
    () => endpoints.notificationMarkAllRead(),
    { successMsg: 'All marked read', invalidate: ['notifications', 'notifications-unread-count'] },
  )
  const markOne = useMutationWithToast(
    (id) => endpoints.notificationMarkRead(id),
    { invalidate: ['notifications', 'notifications-unread-count'] },
  )

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-secondary/60 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white px-1">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">Notifications</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAll.mutate()}>
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setOpen(false); setActivePage('notifications') }}
                >
                  View all
                </Button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {(!recent || recent.length === 0) ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No notifications</div>
              ) : (
                recent.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'px-4 py-3 flex items-start gap-3 hover:bg-secondary/30 transition-colors',
                      !n.is_read && 'bg-primary/5',
                    )}
                  >
                    <div className={cn('mt-0.5 w-2 h-2 rounded-full shrink-0', LEVEL_COLOR[n.level] || 'text-muted-foreground', 'bg-current')} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{n.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                      </div>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => markOne.mutate(n.id)}
                        className="shrink-0 p-1 rounded hover:bg-secondary transition-colors"
                        title="Mark read"
                      >
                        <Check className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function TopBar() {
  const { data: health } = useColabHealth()
  const { data: usage } = useLLMUsage()

  const tts = health?.tts?.ok ?? null
  const image = health?.image?.ok ?? null
  const lipsync = health?.lipsync?.ok ?? null
  const calls = usage?.calls_today ?? usage?.today ?? 0

  return (
    <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8">
      <div className="flex items-center gap-2">
        <h1 className="text-base md:text-lg font-semibold text-gradient">Viral Empire Dashboard</h1>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto">
        <StatusDot ok={tts} label="TTS" icon={Mic} />
        <StatusDot ok={image} label="Image" icon={ImageIcon} />
        <StatusDot ok={lipsync} label="Lipsync" icon={Video} />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/30">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium">{calls}</span>
          <span className="text-xs text-muted-foreground hidden md:inline">API today</span>
        </div>
        <NotificationBell />
      </div>
    </header>
  )
}
