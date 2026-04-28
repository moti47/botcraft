import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAvatars, useMutationWithToast } from '@/hooks/useApi'
import { useStore } from '@/store/useStore'
import { endpoints } from '@/lib/api'
import { Plus, Edit, Play, Pause, Youtube } from 'lucide-react'
import { cn } from '@/lib/utils'

const PLATFORMS = [
  { id: 'youtube', label: 'YT', color: 'text-red-500' },
  { id: 'tiktok', label: 'TT', color: 'text-pink-500' },
  { id: 'instagram', label: 'IG', color: 'text-orange-500' },
]

function PlatformButton({ avatarId, platform, connected, accountInfo }) {
  const [openConnect, setOpenConnect] = useState(false)
  const [token, setToken] = useState('')
  const connect = useMutationWithToast(
    (data) => endpoints.platformConnect(avatarId, data),
    { successMsg: `Connected to ${platform.label}`, invalidate: ['avatars'] },
  )
  const disconnect = useMutationWithToast(
    () => endpoints.platformDisconnect(avatarId, platform.id),
    { successMsg: `Disconnected from ${platform.label}`, invalidate: ['avatars'] },
  )

  return (
    <>
      <button
        onClick={() => setOpenConnect(true)}
        className={cn(
          'px-2.5 py-1 rounded-md text-xs font-semibold border smooth',
          connected ? 'bg-success/15 border-success/40 text-success' : 'bg-secondary border-border text-muted-foreground',
        )}
        title={platform.label}
      >
        {platform.label}
      </button>

      <Dialog open={openConnect} onOpenChange={setOpenConnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{platform.label} connection</DialogTitle>
            <DialogDescription>{connected ? 'Account connected' : 'Paste OAuth token to connect — הדבק טוקן'}</DialogDescription>
          </DialogHeader>
          {connected ? (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="text-muted-foreground">Account:</div>
                <div className="font-medium">{accountInfo?.username || accountInfo?.account_id || 'Unknown'}</div>
              </div>
              <Button
                variant="destructive"
                onClick={() => { disconnect.mutate(); setOpenConnect(false) }}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Token</Label>
                <Input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="paste OAuth token" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenConnect(false)}>Cancel</Button>
                <Button onClick={() => { connect.mutate({ platform: platform.id, access_token: token }); setOpenConnect(false); setToken('') }}>
                  Connect
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AvatarCard({ avatar }) {
  const { openProduceModal, viewAvatarDetail } = useStore()
  const togglePause = useMutationWithToast(
    () => endpoints.avatarUpdate(avatar.id, { status: avatar.status === 'active' ? 'paused' : 'active' }),
    { successMsg: 'Avatar updated', invalidate: ['avatars'] },
  )

  const platforms = avatar.platforms || {}

  return (
    <Card className="overflow-hidden hover:border-primary/40 smooth group">
      <div
        className="aspect-video bg-secondary/40 relative overflow-hidden cursor-pointer"
        onClick={() => viewAvatarDetail(avatar.id)}
      >
        {avatar.face_url ? (
          <img src={avatar.face_url} alt={avatar.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-primary/40">
            {avatar.name?.[0] || '?'}
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge variant={avatar.status === 'active' ? 'success' : 'secondary'}>
            {avatar.status === 'active' ? '● Active' : '⏸ Paused'}
          </Badge>
        </div>
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="cursor-pointer" onClick={() => viewAvatarDetail(avatar.id)}>
          <div className="font-semibold text-base">{avatar.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">{avatar.niche || 'general'}</Badge>
            {avatar.language && <Badge variant="outline" className="text-xs">{avatar.language.toUpperCase()}</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {PLATFORMS.map((p) => (
            <PlatformButton
              key={p.id}
              avatarId={avatar.id}
              platform={p}
              connected={!!platforms[p.id]}
              accountInfo={platforms[p.id]}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-2">
          <span>{avatar.videos_this_week ?? 0} videos / week</span>
          <span>★ {avatar.avg_score?.toFixed?.(1) ?? avatar.avg_score ?? '—'}</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <Button size="sm" variant="outline" onClick={() => viewAvatarDetail(avatar.id)}>
            <Edit className="w-3 h-3" /> Manage
          </Button>
          <Button size="sm" onClick={() => openProduceModal({ avatar_id: avatar.id })}>
            <Play className="w-3 h-3" /> Video
          </Button>
          <Button size="sm" variant="outline" onClick={() => togglePause.mutate()}>
            {avatar.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {avatar.status === 'active' ? 'Pause' : 'Run'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function Avatars() {
  const { data, isLoading } = useAvatars()
  const { setNewAvatarOpen } = useStore()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Avatars</h2>
          <p className="text-sm text-muted-foreground">אווטארים — הדמויות שלך</p>
        </div>
        <Button onClick={() => setNewAvatarOpen(true)}>
          <Plus className="w-4 h-4" /> New Avatar
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-80 w-full" />)}
        </div>
      ) : (data || []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No avatars yet. Create your first one — צור את האווטאר הראשון שלך.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data || []).map((a) => <AvatarCard key={a.id} avatar={a} />)}
        </div>
      )}
    </div>
  )
}
