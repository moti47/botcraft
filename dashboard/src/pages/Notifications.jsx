import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotifications, useMutationWithToast } from '@/hooks/useApi'
import { endpoints } from '@/lib/api'
import { Bell, Check, CheckCheck, Trash2, Info, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEVEL_ICON = {
  info: <Info className="w-4 h-4 text-blue-400" />,
  success: <CheckCircle2 className="w-4 h-4 text-success" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  error: <XCircle className="w-4 h-4 text-destructive" />,
}

const LEVEL_BADGE = {
  info: 'secondary',
  success: 'success',
  warning: 'warning',
  error: 'destructive',
}

function NotificationRow({ n, onMarkRead, onDelete }) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 p-4 rounded-lg border border-border smooth',
        !n.is_read ? 'bg-primary/5 border-primary/20' : 'bg-card',
      )}
    >
      <div className="mt-0.5 shrink-0">{LEVEL_ICON[n.level] || LEVEL_ICON.info}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium text-sm">{n.title}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{n.message}</div>
          </div>
          <Badge variant={LEVEL_BADGE[n.level] || 'secondary'} className="shrink-0 text-[10px]">
            {n.level}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[11px] text-muted-foreground/60">
            {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
          </span>
          {n.avatar_id && (
            <span className="text-[11px] text-muted-foreground/60">Avatar: {n.avatar_id.slice(0, 8)}…</span>
          )}
          {!n.is_read && (
            <span className="text-[11px] font-medium text-primary">● unread</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!n.is_read && (
          <button
            onClick={() => onMarkRead(n.id)}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
            title="Mark read"
          >
            <Check className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
        <button
          onClick={() => onDelete(n.id)}
          className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  )
}

export function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false)

  const { data, isLoading, refetch } = useNotifications(
    unreadOnly ? { unread_only: true, limit: 100 } : { limit: 100 },
  )

  const markOne = useMutationWithToast(
    (id) => endpoints.notificationMarkRead(id),
    { invalidate: ['notifications', 'notifications-unread-count'] },
  )
  const markAll = useMutationWithToast(
    () => endpoints.notificationMarkAllRead(),
    { successMsg: 'All marked read', invalidate: ['notifications', 'notifications-unread-count'] },
  )
  const del = useMutationWithToast(
    (id) => endpoints.notificationDelete(id),
    { invalidate: ['notifications', 'notifications-unread-count'] },
  )

  const items = data || []
  const unreadCount = items.filter((n) => !n.is_read).length

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6" /> Notifications
          </h2>
          <p className="text-sm text-muted-foreground">התראות — {unreadCount} unread</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="unread-only"
              checked={unreadOnly}
              onCheckedChange={setUnreadOnly}
            />
            <Label htmlFor="unread-only" className="text-sm cursor-pointer">Unread only</Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAll.mutate()}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <div>{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onMarkRead={(id) => markOne.mutate(id)}
              onDelete={(id) => del.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
