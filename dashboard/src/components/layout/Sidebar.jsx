import { Home, UserCircle, Film, BarChart3, Settings, Crown, Bell } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useUnreadCount } from '@/hooks/useApi'
import { cn } from '@/lib/utils'

const items = [
  { id: 'overview', icon: Home, label: 'Overview', he: 'סקירה' },
  { id: 'avatars', icon: UserCircle, label: 'Avatars', he: 'אווטארים' },
  { id: 'videos', icon: Film, label: 'Videos', he: 'סרטונים' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics', he: 'אנליטיקה' },
  { id: 'notifications', icon: Bell, label: 'Notifications', he: 'התראות', badge: true },
  { id: 'settings', icon: Settings, label: 'Settings', he: 'הגדרות' },
]

export function Sidebar() {
  const { activePage, setActivePage } = useStore()
  const { data: countData } = useUnreadCount()
  const unread = countData?.count ?? 0

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-[240px] flex-col border-r border-border bg-card z-30">
        <div className="p-6 flex items-center gap-2 border-b border-border">
          <Crown className="w-7 h-7 text-primary" />
          <div>
            <div className="font-bold text-lg leading-tight">Viral Empire</div>
            <div className="text-xs text-muted-foreground">אימפריה ויראלית</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((item) => {
            const Icon = item.icon
            const active = activePage === item.id
            const badge = item.badge && unread > 0 ? unread : 0
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm smooth',
                  active
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <Icon className="w-4 h-4" />
                <div className="flex-1 text-left">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-[10px] opacity-70">{item.he}</div>
                </div>
                {badge > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        <div className="p-4 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse-soft" />
            <span>System operational</span>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border z-30 flex items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon
          const active = activePage === item.id
          const badge = item.badge && unread > 0 ? unread : 0
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 smooth relative',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute top-0.5 right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-white px-0.5">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
              <span className="text-[10px]">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
