import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/store/useStore'
import { useAvatars, useMutationWithToast } from '@/hooks/useApi'
import { endpoints } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

const VOICES = [
  'af_bella', 'af_sarah', 'af_nicole', 'af_sky',
  'am_adam', 'am_michael',
  'bf_emma', 'bm_george',
]

export function ProduceVideoModal() {
  const { produceModalOpen, closeProduceModal, produceModalPrefill } = useStore()
  const { data: avatars } = useAvatars()
  const [form, setForm] = useState({ avatar_id: '', topic: '', voice: 'af_bella' })
  const [submittedId, setSubmittedId] = useState(null)

  useEffect(() => {
    if (produceModalPrefill) setForm((f) => ({ ...f, ...produceModalPrefill }))
  }, [produceModalPrefill])

  useEffect(() => {
    if (!produceModalOpen) {
      setForm({ avatar_id: '', topic: '', voice: 'af_bella' })
      setSubmittedId(null)
    }
  }, [produceModalOpen])

  const produce = useMutationWithToast(
    (data) => endpoints.videoProduce(data).then((r) => r.data),
    { successMsg: 'Video queued!', invalidate: ['videos', 'videos-recent'] },
  )

  const { data: status } = useQuery({
    queryKey: ['video-status', submittedId],
    queryFn: async () => (await endpoints.videoGet(submittedId)).data,
    enabled: !!submittedId,
    refetchInterval: 5000,
  })

  const submit = async () => {
    if (!form.avatar_id || !form.topic) return
    const r = await produce.mutateAsync(form)
    if (r?.id || r?.video_id) setSubmittedId(r.id || r.video_id)
  }

  const progress = status ? (
    status.status === 'posted' ? 100 :
    status.status === 'ready' ? 80 :
    status.status === 'rendering' ? 50 :
    status.status === 'queued' ? 10 : 0
  ) : 0

  return (
    <Dialog open={produceModalOpen} onOpenChange={(v) => !v && closeProduceModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Produce New Video</DialogTitle>
          <DialogDescription>הפק סרטון חדש — בחר אווטאר ונושא</DialogDescription>
        </DialogHeader>

        {submittedId && status ? (
          <div className="space-y-4">
            <div>
              <Label>Status</Label>
              <Badge className="ml-2">{status.status}</Badge>
            </div>
            <Progress value={progress} />
            <div className="text-xs text-muted-foreground">Auto-refresh every 5s · רענון אוטומטי</div>
            <DialogFooter>
              <Button onClick={closeProduceModal}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Avatar</Label>
              <Select value={form.avatar_id} onValueChange={(v) => setForm((f) => ({ ...f, avatar_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select avatar…" /></SelectTrigger>
                <SelectContent>
                  {(avatars || []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} · {a.niche}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Topic / נושא</Label>
              <Input value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} placeholder="e.g. why AI will change everything" />
            </div>
            <div>
              <Label>Voice</Label>
              <Select value={form.voice} onValueChange={(v) => setForm((f) => ({ ...f, voice: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VOICES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeProduceModal}>Cancel</Button>
              <Button onClick={submit} disabled={produce.isPending || !form.avatar_id || !form.topic}>
                {produce.isPending ? 'Submitting…' : 'Produce Video'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
