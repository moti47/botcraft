import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useAnalytics } from '@/hooks/useApi'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const RANGES = [
  { id: '7', label: '7 days', he: '7 ימים' },
  { id: '30', label: '30 days', he: '30 ימים' },
  { id: '365', label: 'All time', he: 'כל הזמן' },
]

const PALETTE = ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6']

const tooltipStyle = {
  backgroundColor: '#111111',
  border: '1px solid #222222',
  borderRadius: '6px',
  fontSize: '12px',
}

export function Analytics() {
  const [days, setDays] = useState('7')
  const { data, isLoading } = useAnalytics(parseInt(days))

  const a = data || {}
  const dailyVideos = a.daily_videos || []
  const platformPosts = a.platform_posts || []
  const dailyScore = a.daily_score || []
  const platformDist = a.platform_distribution || []
  const avatarsPerf = a.avatars_performance || []
  const topVideos = a.top_videos || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-sm text-muted-foreground">אנליטיקה — ביצועים ותובנות</p>
        </div>
        <Tabs value={days} onValueChange={setDays}>
          <TabsList>
            {RANGES.map((r) => <TabsTrigger key={r.id} value={r.id}>{r.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Videos produced per day</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyVideos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2} dot={{ fill: '#8B5CF6' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Posts per platform</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={platformPosts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="platform" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Avg viral score</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyScore}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="score" stroke="#EC4899" strokeWidth={2} dot={{ fill: '#EC4899' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Platform distribution</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={platformDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {platformDist.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Avatar performance — ביצועים לפי אווטאר</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Avatar</TableHead>
                <TableHead>Videos</TableHead>
                <TableHead>Posts</TableHead>
                <TableHead>Avg score</TableHead>
                <TableHead>Best post</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {avatarsPerf.map((a) => (
                <TableRow key={a.id || a.name}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.videos}</TableCell>
                  <TableCell>{a.posts}</TableCell>
                  <TableCell>★ {a.avg_score?.toFixed?.(1) ?? a.avg_score}</TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{a.best_post || '—'}</TableCell>
                </TableRow>
              ))}
              {avatarsPerf.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No data yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Top performing videos — סרטונים מובילים</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {topVideos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No top videos yet</div>
          ) : topVideos.slice(0, 5).map((v, i) => (
            <div key={v.id || i} className="flex items-center gap-3 p-3 rounded-md bg-secondary/40 border border-border">
              <div className="text-xl font-bold text-primary w-6">#{i + 1}</div>
              <div className="w-12 h-16 rounded bg-secondary overflow-hidden flex-shrink-0">
                {v.thumbnail_url && <img src={v.thumbnail_url} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{v.topic}</div>
                <div className="text-xs text-muted-foreground">{v.avatar_name}</div>
              </div>
              <Badge variant="default">★ {v.viral_score?.toFixed?.(1) ?? v.viral_score}</Badge>
              <Badge variant="outline">{v.platform || 'multi'}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
