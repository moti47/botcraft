import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table'
import { useVideos, useMutationWithToast } from '@/hooks/useApi'
import { useStore } from '@/store/useStore'
import { endpoints } from '@/lib/api'
import { Play, Send, Trash2, Plus, Search, Film } from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'

const STATUSES = ['all', 'queued', 'rendering', 'ready', 'posted', 'failed']

const STATUS_VARIANT = {
  queued: 'secondary',
  rendering: 'warning',
  ready: 'success',
  posted: 'default',
  failed: 'destructive',
}

function PipelineProgress({ video }) {
  const steps = [
    { id: 'script', label: 'Script', done: !!video.script_text || video.status !== 'queued' },
    { id: 'tts', label: 'TTS', done: !!video.audio_path || ['ready', 'posted'].includes(video.status) },
    { id: 'lipsync', label: 'Lipsync', done: !!video.final_path || video.status === 'posted' },
    { id: 'post', label: 'Post', done: video.status === 'posted' },
  ]
  return (
    <div className="flex items-center gap-1">
      {steps.map((s) => (
        <div key={s.id} className={cn(
          'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border',
          s.done ? 'border-success/40 bg-success/10 text-success' : 'border-border bg-secondary text-muted-foreground',
        )}>
          <span>{s.done ? '✓' : '○'}</span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

export function Videos() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const params = filter === 'all' ? {} : { status: filter }
  const { data, isLoading, refetch } = useVideos(params)
  const { openProduceModal, setVideoDetail } = useStore()

  const del = useMutationWithToast(
    (id) => endpoints.videoDelete(id),
    { successMsg: 'Video deleted', invalidate: ['videos', 'videos-recent'] },
  )

  const filtered = (data || []).filter((v) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (v.topic || '').toLowerCase().includes(q) || (v.avatar_name || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Videos</h2>
          <p className="text-sm text-muted-foreground">סרטונים — הפקות הוידאו שלך</p>
        </div>
        <Button onClick={() => openProduceModal()}>
          <Plus className="w-4 h-4" /> Produce New Video
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                {STATUSES.map((s) => (
                  <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topic or avatar…" className="pl-9" />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Film className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>No videos yet — אין סרטונים</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Video</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => setVideoDetail(v)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-[60px] h-[80px] rounded bg-secondary overflow-hidden flex-shrink-0">
                          {v.thumbnail_url ? (
                            <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="w-5 h-5 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate max-w-[280px]">{v.topic || 'Untitled'}</div>
                          <div className="text-xs text-muted-foreground truncate">{v.avatar_name}</div>
                          {v.duration && <div className="text-xs text-muted-foreground">{v.duration}s</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[v.status] || 'secondary'}>{v.status}</Badge>
                    </TableCell>
                    <TableCell><PipelineProgress video={v} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(v.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => setVideoDetail(v)}>
                          <Play className="w-3 h-3" />
                        </Button>
                        {v.status === 'ready' && (
                          <Button size="sm" variant="outline" onClick={() => setVideoDetail(v)}>
                            <Send className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm('Delete?')) del.mutate(v.id) }}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
