// עמוד פירוט אווטאר — 6 טאבים: Profile / Platforms / Schedules / Commands / Files / Activity
// נטען לאחר לחיצה על כרטיס ב-Avatars.jsx (currentAvatarId מאוחסן ב-store).
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useStore } from '@/store/useStore'
import { useMutationWithToast } from '@/hooks/useApi'
import { endpoints } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'
import {
  ArrowLeft, RefreshCw, Save, Plus, Trash2, Upload, Edit, GripVertical,
  Youtube, FileText, Image as ImageIcon, Video, Calendar, Clock, Play,
  Share2, Sparkles, TrendingUp, Trophy, Lightbulb,
} from 'lucide-react'
import { useAvatars } from '@/hooks/useApi'
import { cn } from '@/lib/utils'

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', color: 'text-red-500', icon: Youtube },
  { id: 'tiktok', label: 'TikTok', color: 'text-pink-500' },
  { id: 'instagram', label: 'Instagram', color: 'text-orange-500' },
]

// כל סוג מתחבר לעמודה אחרת בטבלת avatars (short_video_schedule וכו')
const VIDEO_TYPES = [
  { id: 'short', column: 'short_video_schedule', label: 'Shorts / Reels', he: 'סרטונים קצרים' },
  { id: 'long', column: 'long_video_schedule', label: 'Long-form', he: 'סרטון ארוך' },
  { id: 'post', column: 'post_schedule', label: 'Auto-publish', he: 'פרסום אוטומטי' },
]

const DAYS = [
  { id: 'daily', label: 'Every day' },
  { id: 'sun', label: 'Sun' },
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
]

// ===== Top-level page =====

export function AvatarDetail() {
  const { currentAvatarId, closeAvatarDetail } = useStore()

  const { data: avatar, isLoading } = useQuery({
    queryKey: ['avatar', currentAvatarId],
    queryFn: async () => (await endpoints.avatarGet(currentAvatarId)).data,
    enabled: !!currentAvatarId,
  })

  if (!currentAvatarId) return null

  if (isLoading || !avatar) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={closeAvatarDetail}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{avatar.name}</h2>
            <p className="text-sm text-muted-foreground">
              {avatar.niche || 'general'} · {avatar.language?.toUpperCase() || 'EN'}
            </p>
          </div>
        </div>
        <Badge variant={avatar.status === 'active' ? 'success' : 'secondary'}>
          {avatar.status === 'active' ? '● Active' : '⏸ Paused'}
        </Badge>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="variants">A/B</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab avatar={avatar} />
        </TabsContent>
        <TabsContent value="platforms" className="mt-4">
          <PlatformsTab avatar={avatar} />
        </TabsContent>
        <TabsContent value="schedules" className="mt-4">
          <SchedulesTab avatar={avatar} />
        </TabsContent>
        <TabsContent value="commands" className="mt-4">
          <CommandsTab avatarId={avatar.id} />
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <FilesTab avatarId={avatar.id} />
        </TabsContent>
        <TabsContent value="ideas" className="mt-4">
          <IdeasTab avatar={avatar} />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <InsightsTab avatar={avatar} />
        </TabsContent>
        <TabsContent value="variants" className="mt-4">
          <VariantsTab avatar={avatar} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab avatarId={avatar.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ===== Tab 1: Profile =====

function ProfileTab({ avatar }) {
  const [json, setJson] = useState(JSON.stringify(avatar.persona_dna || {}, null, 2))

  useEffect(() => {
    setJson(JSON.stringify(avatar.persona_dna || {}, null, 2))
  }, [avatar])

  const save = useMutationWithToast(
    (data) => endpoints.avatarUpdate(avatar.id, data),
    { successMsg: 'Avatar updated', invalidate: ['avatars', 'avatar'] },
  )

  const regenImage = useMutationWithToast(
    () => endpoints.avatarRegenerateImage(avatar.id),
    { successMsg: 'Face regenerated', invalidate: ['avatars', 'avatar'] },
  )

  const duplicate = useMutationWithToast(
    () => endpoints.avatarDuplicate(avatar.id, {}),
    { successMsg: 'Avatar duplicated', invalidate: ['avatars'] },
  )

  const handleSaveDna = () => {
    try {
      const parsed = JSON.parse(json)
      save.mutate({ persona_dna: parsed })
    } catch {
      toast({ title: 'Invalid JSON', variant: 'destructive' })
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle>Face image</CardTitle>
          <CardDescription>תמונת פרצוף — קבועה לכל סרטון</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="aspect-square rounded-md overflow-hidden bg-secondary/40 border border-border">
            {avatar.face_url ? (
              <img src={avatar.face_url} alt={avatar.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-primary/40">
                {avatar.name?.[0] || '?'}
              </div>
            )}
          </div>
          {avatar.needs_face_regeneration && (
            <div className="text-xs p-2 rounded bg-warning/10 border border-warning/30 text-warning">
              ⚠ Face needs regeneration
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => regenImage.mutate()}
            disabled={regenImage.isPending}
          >
            <RefreshCw className={regenImage.isPending ? 'animate-spin w-4 h-4' : 'w-4 h-4'} />
            {regenImage.isPending ? 'Regenerating…' : 'Regenerate Image'}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => duplicate.mutate()}
            disabled={duplicate.isPending}
          >
            <Edit className="w-4 h-4" />
            {duplicate.isPending ? 'Duplicating…' : 'Duplicate Avatar'}
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Persona DNA</CardTitle>
          <CardDescription>ה-DNA של הדמות — JSON</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                value={avatar.name || ''}
                onChange={(e) => save.mutate({ name: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={avatar.status || 'active'}
                onValueChange={(v) => save.mutate({ status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border">
            <div>
              <div className="text-sm font-medium">Auto-publish</div>
              <div className="text-xs text-muted-foreground">Automatically publish ready videos without approval</div>
            </div>
            <Switch
              checked={!!avatar.auto_publish}
              onCheckedChange={(v) => save.mutate({ auto_publish: v })}
            />
          </div>
          <div>
            <Label>Persona DNA (JSON)</Label>
            <Textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              className="font-mono text-xs min-h-[320px]"
            />
          </div>
          <Button onClick={handleSaveDna} disabled={save.isPending}>
            <Save className="w-4 h-4" /> Save DNA
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ===== Tab 2: Platforms =====

function PlatformsTab({ avatar }) {
  const platforms = avatar.platforms || {}
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {PLATFORMS.map((p) => (
        <PlatformCard key={p.id} avatar={avatar} platform={p} info={platforms[p.id]} />
      ))}
    </div>
  )
}

function PlatformCard({ avatar, platform, info }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const connect = useMutationWithToast(
    (data) => endpoints.platformConnect(avatar.id, data),
    { successMsg: `Connected to ${platform.label}`, invalidate: ['avatars', 'avatar'] },
  )
  const disconnect = useMutationWithToast(
    () => endpoints.platformDisconnect(avatar.id, platform.id),
    { successMsg: `Disconnected from ${platform.label}`, invalidate: ['avatars', 'avatar'] },
  )

  const connected = !!info
  return (
    <Card>
      <CardHeader>
        <CardTitle className={cn('flex items-center justify-between', platform.color)}>
          {platform.label}
          <Badge variant={connected ? 'success' : 'secondary'}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected ? (
          <>
            <div className="text-sm">
              <div className="text-muted-foreground">Account:</div>
              <div className="font-medium">{info?.username || info?.account_id || 'Unknown'}</div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => disconnect.mutate()}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            Connect
          </Button>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to {platform.label}</DialogTitle>
            <DialogDescription>Paste OAuth token — הדבק טוקן</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Token</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} type="password" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  connect.mutate({ platform: platform.id, access_token: token })
                  setOpen(false)
                  setToken('')
                }}
              >
                Connect
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ===== Tab 3: Schedules =====

function SchedulesTab({ avatar }) {
  // 3 לוחות נפרדים שמתחברים לעמודות נפרדות בטבלת avatars
  const initial = (av) => ({
    short: av.short_video_schedule || { enabled: false, times: [] },
    long: av.long_video_schedule || { enabled: false, times: [] },
    post: av.post_schedule || { enabled: false, times: [] },
  })
  const [schedules, setSchedules] = useState(initial(avatar))

  useEffect(() => {
    setSchedules(initial(avatar))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar.id])

  const save = useMutationWithToast(
    (data) => endpoints.avatarUpdate(avatar.id, data),
    { successMsg: 'Schedules saved', invalidate: ['avatars', 'avatar', 'scheduler-status'] },
  )

  const updateType = (typeId, patch) => {
    setSchedules((s) => ({
      ...s,
      [typeId]: { ...(s[typeId] || { enabled: false, times: [] }), ...patch },
    }))
  }

  const addSlot = (typeId) => {
    const cur = schedules[typeId] || { enabled: true, times: [] }
    updateType(typeId, { enabled: true, times: [...(cur.times || []), { day: 'daily', hour: 9, minute: 0 }] })
  }

  const removeSlot = (typeId, idx) => {
    const cur = schedules[typeId] || { enabled: false, times: [] }
    updateType(typeId, { times: (cur.times || []).filter((_, i) => i !== idx) })
  }

  const setSlot = (typeId, idx, patch) => {
    const cur = schedules[typeId] || { enabled: false, times: [] }
    const times = (cur.times || []).map((s, i) => (i === idx ? { ...s, ...patch } : s))
    updateType(typeId, { times })
  }

  const handleSave = () => {
    save.mutate({
      short_video_schedule: schedules.short,
      long_video_schedule: schedules.long,
      post_schedule: schedules.post,
    })
  }

  const toggleVacation = useMutationWithToast(
    (v) => endpoints.avatarUpdate(avatar.id, { is_paused: v }),
    { successMsg: 'Vacation mode updated', invalidate: ['avatars', 'avatar'] },
  )

  return (
    <div className="space-y-4">
      {/* Vacation mode */}
      <Card className={avatar.is_paused ? 'border-warning/40 bg-warning/5' : ''}>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-sm flex items-center gap-2">
              {avatar.is_paused ? '🏖 Vacation mode — ON' : '🏃 Vacation mode — OFF'}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              When ON, all scheduled jobs are skipped until turned off · מצב חופשה
            </div>
          </div>
          <Switch
            checked={!!avatar.is_paused}
            onCheckedChange={(v) => toggleVacation.mutate(v)}
          />
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        All times are in Asia/Jerusalem timezone · כל הזמנים באזור אסיה/ירושלים
      </div>
      {VIDEO_TYPES.map((t) => {
        const conf = schedules[t.id] || { enabled: false, times: [] }
        return (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> {t.label}
                  </CardTitle>
                  <CardDescription>{t.he}</CardDescription>
                </div>
                <Switch
                  checked={!!conf.enabled}
                  onCheckedChange={(v) => updateType(t.id, { enabled: v })}
                />
              </div>
            </CardHeader>
            {conf.enabled && (
              <CardContent className="space-y-2">
                {(conf.times || []).map((slot, idx) => {
                  const timeStr = `${String(slot.hour ?? 9).padStart(2, '0')}:${String(slot.minute ?? 0).padStart(2, '0')}`
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <Select
                        value={slot.day || 'daily'}
                        onValueChange={(v) => setSlot(t.id, idx, { day: v })}
                      >
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAYS.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="time"
                        value={timeStr}
                        onChange={(e) => {
                          const [hh, mm] = e.target.value.split(':').map((n) => Number(n))
                          setSlot(t.id, idx, { hour: hh, minute: mm })
                        }}
                        className="w-32"
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeSlot(t.id, idx)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )
                })}
                <Button variant="outline" size="sm" onClick={() => addSlot(t.id)}>
                  <Plus className="w-4 h-4" /> Add slot
                </Button>
              </CardContent>
            )}
          </Card>
        )
      })}

      <Button onClick={handleSave} disabled={save.isPending}>
        <Save className="w-4 h-4" /> Save schedules
      </Button>
    </div>
  )
}

// ===== Tab 4: Commands =====

function CommandsTab({ avatarId }) {
  const { data: commands, isLoading } = useQuery({
    queryKey: ['commands', avatarId],
    queryFn: async () => (await endpoints.commandsList(avatarId)).data,
    enabled: !!avatarId,
  })
  const [newText, setNewText] = useState('')

  const create = useMutationWithToast(
    (data) => endpoints.commandCreate(avatarId, data),
    { successMsg: 'Command added', invalidate: ['commands'] },
  )
  const update = useMutationWithToast(
    ({ id, data }) => endpoints.commandUpdate(avatarId, id, data),
    { invalidate: ['commands'] },
  )
  const remove = useMutationWithToast(
    (id) => endpoints.commandDelete(avatarId, id),
    { successMsg: 'Command removed', invalidate: ['commands'] },
  )

  const handleAdd = () => {
    if (!newText.trim()) return
    // ה-API מצפה ל-command_text + priority (1..10)
    const next = Math.min(10, Math.max(1, (commands?.length || 0) + 1))
    create.mutate({ command_text: newText.trim(), priority: next })
    setNewText('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permanent commands</CardTitle>
        <CardDescription>הוראות קבועות — נוספות ל-system prompt בכל הפקה</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder='e.g. "Always end videos with a CTA"'
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={create.isPending}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (commands || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No commands yet — אין הוראות עדיין
          </div>
        ) : (
          <div className="space-y-2">
            {(commands || [])
              .slice()
              .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
              .map((c) => (
                <CommandRow key={c.id} command={c} onUpdate={update} onRemove={remove} />
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CommandRow({ command, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(command.command_text || '')

  return (
    <div className="flex items-center gap-2 p-2 rounded bg-secondary/40 border border-border">
      <GripVertical className="w-4 h-4 text-muted-foreground" />
      <Badge variant="outline" className="shrink-0">#{command.priority ?? 0}</Badge>
      {editing ? (
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setEditing(false)
            if (text !== command.command_text) onUpdate.mutate({ id: command.id, data: { command_text: text } })
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="flex-1"
        />
      ) : (
        <div className="flex-1 text-sm cursor-pointer" onClick={() => setEditing(true)}>
          {command.command_text}
        </div>
      )}
      <Switch
        checked={!!command.is_active}
        onCheckedChange={(v) => onUpdate.mutate({ id: command.id, data: { is_active: v } })}
      />
      <Button variant="ghost" size="sm" onClick={() => onRemove.mutate(command.id)}>
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  )
}

// ===== Tab 5: Files =====

function FilesTab({ avatarId }) {
  const fileInput = useRef(null)
  const { data: files, isLoading } = useQuery({
    queryKey: ['files', avatarId],
    queryFn: async () => (await endpoints.filesList(avatarId)).data,
    enabled: !!avatarId,
  })

  const upload = useMutationWithToast(
    (formData) => endpoints.fileUpload(avatarId, formData),
    { successMsg: 'File uploaded', invalidate: ['files'] },
  )
  const update = useMutationWithToast(
    ({ id, data }) => endpoints.fileUpdate(avatarId, id, data),
    { invalidate: ['files'] },
  )
  const remove = useMutationWithToast(
    (id) => endpoints.fileDelete(avatarId, id),
    { successMsg: 'File removed', invalidate: ['files'] },
  )

  const handleSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: 'File too large (>100MB)', variant: 'destructive' })
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('description', '')
    upload.mutate(fd)
    e.target.value = ''
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Files & assets</CardTitle>
            <CardDescription>קבצים ומשאבים — עד 100MB לקובץ</CardDescription>
          </div>
          <Button onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
            <Upload className="w-4 h-4" /> {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
          <input ref={fileInput} type="file" className="hidden" onChange={handleSelect} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (files || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No files yet — אין קבצים עדיין
          </div>
        ) : (
          (files || []).map((f) => (
            <FileRow key={f.id} file={f} onUpdate={update} onRemove={remove} />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function FileRow({ file, onUpdate, onRemove }) {
  const [desc, setDesc] = useState(file.description || '')
  const [editing, setEditing] = useState(false)

  const ft = file.file_type || ''
  const Icon =
    ft.startsWith('image/') ? ImageIcon
    : ft.startsWith('video/') ? Video
    : FileText

  const sizeBytes = file.file_size_bytes ?? 0
  const sizeKb = Math.round(sizeBytes / 1024)
  const sizeText = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`

  return (
    <div className="flex items-center gap-3 p-2 rounded bg-secondary/40 border border-border">
      <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{file.filename}</div>
        {editing ? (
          <Input
            autoFocus
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => {
              setEditing(false)
              if (desc !== file.description) onUpdate.mutate({ id: file.id, data: { description: desc } })
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            className="h-7 text-xs mt-1"
            placeholder="description (used by LLM)"
          />
        ) : (
          <div
            className="text-xs text-muted-foreground cursor-pointer truncate"
            onClick={() => setEditing(true)}
          >
            {file.description || <span className="italic">(click to add description)</span>}
          </div>
        )}
      </div>
      <Badge variant="outline" className="text-xs shrink-0">{sizeText}</Badge>
      <Button variant="ghost" size="sm" onClick={() => onRemove.mutate(file.id)}>
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  )
}

// ===== Tab 6: Ideas bank =====

function IdeasTab({ avatar }) {
  const [newIdea, setNewIdea] = useState('')
  const { data: ideas, isLoading } = useQuery({
    queryKey: ['ideas', avatar.id],
    queryFn: async () => (await endpoints.ideasList(avatar.id)).data,
    enabled: !!avatar.id,
  })

  const create = useMutationWithToast(
    (data) => endpoints.ideaCreate(avatar.id, data),
    { successMsg: 'Idea added', invalidate: ['ideas'] },
  )
  const remove = useMutationWithToast(
    (ideaId) => endpoints.ideaDelete(avatar.id, ideaId),
    { successMsg: 'Idea deleted', invalidate: ['ideas'] },
  )
  const markUsed = useMutationWithToast(
    (ideaId) => endpoints.ideaMarkUsed(avatar.id, ideaId),
    { successMsg: 'Marked as used', invalidate: ['ideas'] },
  )
  const produceFromIdea = useMutationWithToast(
    ({ ideaId, text }) => {
      markUsed.mutate(ideaId)
      return endpoints.videoProduce({ avatar_id: avatar.id, topic: text })
    },
    { successMsg: 'Video queued from idea', invalidate: ['videos-recent'] },
  )

  const handleAdd = () => {
    if (!newIdea.trim()) return
    create.mutate({ idea_text: newIdea.trim() })
    setNewIdea('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content ideas</CardTitle>
        <CardDescription>בנק רעיונות — לחץ "Produce" כדי להפוך לסרטון</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={newIdea}
            onChange={(e) => setNewIdea(e.target.value)}
            placeholder='e.g. "5 AI tools that changed my workflow"'
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={create.isPending}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (ideas || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No ideas yet — הוסף רעיונות לתוכן
          </div>
        ) : (
          <div className="space-y-2">
            {(ideas || []).map((idea) => (
              <div
                key={idea.id}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg border',
                  idea.is_used
                    ? 'bg-secondary/20 border-border opacity-60'
                    : 'bg-secondary/40 border-border',
                )}
              >
                <div className="flex-1 text-sm">
                  {idea.idea_text}
                  {idea.is_used && <Badge variant="secondary" className="ml-2 text-[10px]">used</Badge>}
                </div>
                {!idea.is_used && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => produceFromIdea.mutate({ ideaId: idea.id, text: idea.idea_text })}
                  >
                    <Play className="w-3 h-3" /> Produce
                  </Button>
                )}
                <ShareIdeaButton srcAvatarId={avatar.id} ideaId={idea.id} />
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(idea.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ===== Tab 7: Activity =====

function ActivityTab({ avatarId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['videos-by-avatar', avatarId],
    queryFn: async () => (await endpoints.videosList({ avatar_id: avatarId, limit: 50 })).data,
    enabled: !!avatarId,
  })

  const videos = data || []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>הסרטונים האחרונים של האווטאר</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : videos.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No videos yet — אין סרטונים עדיין
          </div>
        ) : (
          <div className="space-y-2">
            {videos.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 p-2 rounded bg-secondary/40 border border-border"
              >
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{v.topic || v.title || v.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {v.created_at ? new Date(v.created_at).toLocaleString() : '—'}
                  </div>
                </div>
                <Badge
                  variant={
                    v.status === 'ready' || v.status === 'published' ? 'success'
                    : v.status === 'failed' ? 'destructive'
                    : 'secondary'
                  }
                >
                  {v.status || 'unknown'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ===== Share idea to another avatar =====

function ShareIdeaButton({ srcAvatarId, ideaId }) {
  const [open, setOpen] = useState(false)
  const { data: avatars } = useAvatars()
  const others = (avatars || []).filter((a) => a.id !== srcAvatarId)

  const share = useMutationWithToast(
    (dstId) => endpoints.ideaShareTo(srcAvatarId, ideaId, dstId),
    { successMsg: 'Idea adapted and shared', invalidate: ['ideas'] },
  )

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Share idea to another avatar">
        <Share2 className="w-3.5 h-3.5" />
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <Select onValueChange={(v) => { share.mutate(v); setOpen(false) }}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="Share to…" />
        </SelectTrigger>
        <SelectContent>
          {others.length === 0 && <SelectItem value="__none" disabled>No other avatars</SelectItem>}
          {others.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name || a.id.slice(0, 6)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>×</Button>
    </div>
  )
}

// ===== Tab: Insights =====

function InsightsTab({ avatar }) {
  const { data: insights, isLoading } = useQuery({
    queryKey: ['insights', avatar.id],
    queryFn: async () => (await endpoints.insightsGet(avatar.id)).data,
    enabled: !!avatar.id,
  })

  const refresh = useMutationWithToast(
    () => endpoints.insightsRefresh(avatar.id),
    { successMsg: 'Insights refreshed', invalidate: ['insights'] },
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> AI Insights
            </CardTitle>
            <CardDescription>תובנות חכמות — המלצות לתוכן, שעות פרסום, נישות משנה</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={refresh.isPending ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : !insights ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No insights yet — לחץ Refresh ליצירת ניתוח ראשון
          </div>
        ) : (
          <>
            <div className="p-3 rounded-md bg-secondary/40 border border-border text-sm">
              {insights.summary}
            </div>

            {(insights.recommendations || []).length > 0 && (
              <div>
                <Label className="flex items-center gap-1.5"><Lightbulb className="w-4 h-4" /> Recommendations</Label>
                <div className="space-y-2 mt-2">
                  {insights.recommendations.map((r, i) => (
                    <div key={i} className="p-3 rounded border border-border bg-secondary/20">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{r.title}</div>
                        <Badge variant="secondary" className="text-[10px]">{r.category}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{r.rationale}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(insights.analysis?.best_hours || []).length > 0 && (
                <div>
                  <Label>Best hours</Label>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {insights.analysis.best_hours.map((h, i) => (
                      <Badge key={i} variant="outline" className="font-mono">{h}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(insights.analysis?.best_topics || []).length > 0 && (
                <div>
                  <Label>Best topics</Label>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {insights.analysis.best_topics.map((t, i) => (
                      <Badge key={i} variant="outline">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {insights.based_on_videos !== undefined && (
              <div className="text-[11px] text-muted-foreground text-right">
                based on {insights.based_on_videos} videos · generated {insights.generated_at ? new Date(insights.generated_at).toLocaleString() : 'just now'}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ===== Tab: Persona variants (A/B testing) =====

function VariantsTab({ avatar }) {
  const [label, setLabel] = useState('')
  const { data: variants, isLoading } = useQuery({
    queryKey: ['variants', avatar.id],
    queryFn: async () => (await endpoints.variantsList(avatar.id)).data,
    enabled: !!avatar.id,
  })

  const create = useMutationWithToast(
    (data) => endpoints.variantCreate(avatar.id, data),
    { successMsg: 'Variant created', invalidate: ['variants'] },
  )
  const promote = useMutationWithToast(
    (vid) => endpoints.variantPromote(avatar.id, vid),
    { successMsg: 'Variant promoted to main DNA', invalidate: ['variants', 'avatars'] },
  )
  const remove = useMutationWithToast(
    (vid) => endpoints.variantDelete(avatar.id, vid),
    { successMsg: 'Variant removed', invalidate: ['variants'] },
  )

  const winner = (variants || []).reduce(
    (best, v) => (best == null || (v.avg_score ?? 0) > (best.avg_score ?? 0) ? v : best),
    null,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> A/B Persona Variants
        </CardTitle>
        <CardDescription>2+ וריאציות פעילות של ה-DNA — האנליטיקה מציגה מי מנצח</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='Variant label, e.g. "B — playful"'
          />
          <Button
            onClick={() => { if (label.trim()) { create.mutate({ label: label.trim() }); setLabel('') } }}
            disabled={create.isPending}
          >
            <Plus className="w-4 h-4" /> Add (clones current DNA)
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (variants || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No variants yet — הוסף וריאציה כדי להתחיל A/B
          </div>
        ) : (
          <div className="space-y-2">
            {variants.map((v) => {
              const isWinner = winner && v.id === winner.id && (v.avg_score ?? 0) > 0
              return (
                <div
                  key={v.id}
                  className={cn(
                    'p-3 rounded-lg border',
                    isWinner ? 'bg-success/10 border-success/40' : 'bg-secondary/40 border-border',
                    v.promoted_at && 'ring-1 ring-primary/40',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isWinner && <Trophy className="w-4 h-4 text-success" />}
                      <span className="font-medium text-sm">{v.label}</span>
                      {v.promoted_at && <Badge variant="secondary" className="text-[10px]">promoted</Badge>}
                      {!v.is_active && <Badge variant="outline" className="text-[10px]">inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => promote.mutate(v.id)} title="Promote to main DNA">
                        <Trophy className="w-3 h-3" /> Promote
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(v.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[11px] text-muted-foreground">
                    <div>videos: <span className="font-mono text-foreground">{v.videos_count ?? 0}</span></div>
                    <div>avg score: <span className="font-mono text-foreground">{v.avg_score?.toFixed?.(2) ?? '—'}</span></div>
                    <div>views: <span className="font-mono text-foreground">{v.total_views ?? 0}</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
