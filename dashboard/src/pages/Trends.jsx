import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useTrends } from '@/hooks/useApi'
import { useStore } from '@/store/useStore'
import { Flame, RefreshCw } from 'lucide-react'

const PLATFORM_COLORS = {
  youtube: 'bg-red-500/15 text-red-400 border-red-500/30',
  tiktok: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  instagram: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  twitter: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
}

export function Trends() {
  const { data, refetch, isFetching } = useTrends()
  const { openProduceModal } = useStore()
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => refetch(), 6 * 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [autoRefresh, refetch])

  const trends = data?.trends || data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Flame className="text-warning" /> Trends</h2>
          <p className="text-sm text-muted-foreground">טרנדים — מה לוהט עכשיו</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/40 border border-border">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} id="auto-refresh" />
            <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">Auto-refresh (6h)</Label>
          </div>
          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin w-4 h-4' : 'w-4 h-4'} />
            Fetch Latest Trends
          </Button>
        </div>
      </div>

      {isFetching ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : trends.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Flame className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>Click "Fetch Latest Trends" to see what's hot — לחץ למשוך טרנדים</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trends.map((t, i) => {
            const score = t.score ?? t.viral_score ?? 0
            const platform = (t.platform || 'multi').toLowerCase()
            return (
              <Card key={t.id || i} className="hover:border-primary/40 smooth">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{t.name || t.topic || t.title}</CardTitle>
                    <Badge className={PLATFORM_COLORS[platform] || 'border-border'} variant="outline">{platform}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Viral score</span>
                      <span className="font-bold text-primary">{score}/100</span>
                    </div>
                    <Progress value={score} />
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(t.niches || t.tags || []).slice(0, 4).map((n, j) => (
                      <Badge key={j} variant="outline" className="text-xs">{n}</Badge>
                    ))}
                  </div>

                  <Button size="sm" className="w-full" onClick={() => openProduceModal({ topic: t.name || t.topic || t.title })}>
                    Use this trend
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
