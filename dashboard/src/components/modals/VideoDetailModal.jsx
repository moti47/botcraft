import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/store/useStore'
import { useMutationWithToast } from '@/hooks/useApi'
import { endpoints } from '@/lib/api'
import { Send, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
]

const PIPELINE_STAGES = [
  { key: 'queued', label: 'Queued' },
  { key: 'script_ready', label: 'Script' },
  { key: 'tts_done', label: 'TTS' },
  { key: 'image_ready', label: 'Image' },
  { key: 'lipsync_done', label: 'Lipsync' },
  { key: 'ready', label: 'Ready' },
]

function PipelineTimeline({ video }) {
  const stages = video?.render_options?.stages || video?.stages || {}
  const status = (video?.status || '').toLowerCase()
  const isFailed = status === 'failed'

  // Determine the index of the most recent completed stage
  const completedIdx = PIPELINE_STAGES.reduce(
    (acc, s, i) => (stages[s.key] ? i : acc),
    -1,
  )

  return (
    <div>
      <Label>Pipeline</Label>
      <div className="mt-2 flex items-stretch gap-1 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((s, i) => {
          const ts = stages[s.key]
          const done = !!ts
          const running = i === completedIdx + 1 && !isFailed && status !== 'ready'
          const failed = isFailed && i === completedIdx + 1
          return (
            <div
              key={s.key}
              className={cn(
                'flex-1 min-w-[72px] rounded-md border p-2 text-[11px] flex flex-col items-center gap-0.5',
                done && 'border-success/50 bg-success/10 text-success',
                running && 'border-primary/60 bg-primary/10 text-primary',
                failed && 'border-destructive/60 bg-destructive/10 text-destructive',
                !done && !running && !failed && 'border-border bg-secondary/30 text-muted-foreground',
              )}
              title={ts ? new Date(ts).toLocaleString() : 'pending'}
            >
              {failed
                ? <XCircle className="w-4 h-4" />
                : done
                ? <CheckCircle2 className="w-4 h-4" />
                : running
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Clock className="w-4 h-4" />}
              <div className="font-medium">{s.label}</div>
              {ts && <div className="opacity-70 text-[9px]">{new Date(ts).toLocaleTimeString()}</div>}
            </div>
          )
        })}
      </div>
      {isFailed && video?.error_message && (
        <div className="mt-2 p-2 rounded text-xs bg-destructive/10 border border-destructive/30 text-destructive whitespace-pre-wrap">
          {video.error_message}
        </div>
      )}
    </div>
  )
}

export function VideoDetailModal() {
  const { videoDetail, setVideoDetail } = useStore()
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [selected, setSelected] = useState({})

  useEffect(() => {
    if (videoDetail) {
      setCaption(videoDetail.caption || '')
      setHashtags((videoDetail.hashtags || []).join(' '))
      setSelected({})
    }
  }, [videoDetail])

  const publish = useMutationWithToast(
    (data) => endpoints.postPublish(data),
    { successMsg: 'Publishing started', invalidate: ['videos'] },
  )

  if (!videoDetail) return null

  const connectedPlatforms = PLATFORMS.filter((p) => videoDetail.platforms?.[p.id] || videoDetail.avatar_platforms?.[p.id])

  const handlePublish = () => {
    const platforms = Object.keys(selected).filter((k) => selected[k])
    publish.mutate({
      video_id: videoDetail.id,
      platforms,
      caption,
      hashtags: hashtags.split(/\s+/).filter(Boolean),
    })
  }

  return (
    <Dialog open={!!videoDetail} onOpenChange={(v) => !v && setVideoDetail(null)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{videoDetail.topic}</DialogTitle>
          <DialogDescription>
            {videoDetail.avatar_name} · <Badge variant="secondary" className="ml-1">{videoDetail.status}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {videoDetail.thumbnail_url && (
            <img
              src={videoDetail.thumbnail_url}
              alt="thumbnail"
              className="w-full rounded-md object-cover max-h-56 bg-secondary/40"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          )}

          {videoDetail.final_path || videoDetail.video_url ? (
            <video src={videoDetail.video_url || videoDetail.final_path} controls className="w-full rounded-md bg-black" />
          ) : (
            <div className="aspect-video rounded-md bg-secondary/50 flex items-center justify-center text-muted-foreground">
              Video not ready yet — הסרטון עדיין לא מוכן
            </div>
          )}

          <PipelineTimeline video={videoDetail} />

          {videoDetail.script_text && (
            <div>
              <Label>Script</Label>
              <div className="p-3 rounded-md bg-secondary/40 border border-border text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                {videoDetail.script_text}
              </div>
            </div>
          )}

          <div>
            <Label>Caption</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} />
          </div>

          <div>
            <Label>Hashtags</Label>
            <Textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={2} placeholder="#viral #ai" />
          </div>

          {connectedPlatforms.length > 0 && (
            <div>
              <Label>Publish to</Label>
              <div className="space-y-2 mt-2">
                {connectedPlatforms.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded bg-secondary/40 border border-border">
                    <span className="text-sm font-medium">{p.label}</span>
                    <Switch
                      checked={!!selected[p.id]}
                      onCheckedChange={(v) => setSelected((s) => ({ ...s, [p.id]: v }))}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={handlePublish} disabled={publish.isPending} className="w-full mt-3">
                <Send className="w-4 h-4" /> Publish Selected
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
