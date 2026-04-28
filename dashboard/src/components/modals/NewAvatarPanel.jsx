import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/store/useStore'
import { useMutationWithToast } from '@/hooks/useApi'
import { endpoints } from '@/lib/api'
import { ChevronDown, ChevronRight, Save, Wand2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'he', label: 'עברית' },
  { id: 'es', label: 'Español' },
  { id: 'ar', label: 'العربية' },
]

const TONES = [
  { id: 'energetic', label: 'Energetic ⚡' },
  { id: 'mysterious', label: 'Mysterious 🌙' },
  { id: 'sarcastic', label: 'Sarcastic 😏' },
  { id: 'warm', label: 'Warm 🌞' },
]

const STYLES = [
  { id: 'realistic', label: 'Realistic', desc: 'Photorealistic person' },
  { id: 'anime', label: 'Anime', desc: 'Japanese animation style' },
  { id: '3d', label: '3D', desc: 'Pixar-like render' },
  { id: 'cinematic', label: 'Cinematic', desc: 'Movie poster lighting' },
  { id: 'cartoon', label: 'Cartoon', desc: 'Bold flat illustration' },
]

const PRESETS = [
  {
    id: 'gaming',
    emoji: '🎮',
    label: 'Gaming Streamer',
    niche: 'gaming and esports',
    language: 'en',
    tone: 'energetic',
    avatar_style: 'anime',
  },
  {
    id: 'fitness',
    emoji: '💪',
    label: 'Fitness Coach',
    niche: 'fitness and health',
    language: 'en',
    tone: 'energetic',
    avatar_style: 'realistic',
  },
  {
    id: 'news',
    emoji: '📰',
    label: 'News Commentator',
    niche: 'news and current events',
    language: 'en',
    tone: 'warm',
    avatar_style: 'realistic',
  },
  {
    id: 'comedy',
    emoji: '😂',
    label: 'Comedy Creator',
    niche: 'comedy and entertainment',
    language: 'en',
    tone: 'sarcastic',
    avatar_style: 'cartoon',
  },
  {
    id: 'tech',
    emoji: '🤖',
    label: 'Tech Reviewer',
    niche: 'technology and gadgets',
    language: 'en',
    tone: 'mysterious',
    avatar_style: 'cinematic',
  },
  {
    id: 'cooking',
    emoji: '🍳',
    label: 'Cooking Creator',
    niche: 'cooking and food',
    language: 'en',
    tone: 'warm',
    avatar_style: 'realistic',
  },
  {
    id: 'lifestyle',
    emoji: '✨',
    label: 'Lifestyle Influencer',
    niche: 'lifestyle and fashion',
    language: 'en',
    tone: 'warm',
    avatar_style: '3d',
  },
]

const BLANK_FORM = { niche: '', language: 'en', tone: 'energetic', avatar_style: 'realistic' }

export function NewAvatarPanel() {
  const { newAvatarOpen, setNewAvatarOpen } = useStore()
  const [form, setForm] = useState(BLANK_FORM)
  const [generated, setGenerated] = useState(null)
  const [showJson, setShowJson] = useState(true)
  const [selectedPreset, setSelectedPreset] = useState(null)

  const generate = useMutationWithToast(
    (data) => endpoints.avatarCreate(data).then((r) => r.data),
    { successMsg: 'Persona DNA generated — face generating in background', invalidate: ['avatars'] },
  )

  const applyPreset = (preset) => {
    setSelectedPreset(preset.id)
    setForm({ niche: preset.niche, language: preset.language, tone: preset.tone, avatar_style: preset.avatar_style })
    setGenerated(null)
  }

  const handleGenerate = async () => {
    const r = await generate.mutateAsync(form)
    setGenerated(r)
  }

  const close = () => {
    setNewAvatarOpen(false)
    setForm(BLANK_FORM)
    setGenerated(null)
    setSelectedPreset(null)
  }

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }))

  return (
    <Sheet open={newAvatarOpen} onOpenChange={(v) => !v && close()}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New Avatar</SheetTitle>
          <SheetDescription>אווטאר חדש — צור דמות חדשה. הפנים ייווצרו אוטומטית ברקע.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {/* Presets */}
          <div>
            <Label className="mb-2 block">Quick presets — פריסטים מהירים</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left smooth',
                    selectedPreset === p.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-secondary/50',
                  )}
                >
                  <span className="text-lg">{p.emoji}</span>
                  <span className="font-medium leading-tight">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or fill manually</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div>
            <Label>Niche / נישה</Label>
            <Input
              value={form.niche}
              onChange={(e) => { setForm((f) => ({ ...f, niche: e.target.value })); setSelectedPreset(null) }}
              placeholder="e.g. tech, fitness, finance"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Language / שפה</Label>
              <Select value={form.language} onValueChange={set('language')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tone / טון</Label>
              <Select value={form.tone} onValueChange={set('tone')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Style selector */}
          <div>
            <Label className="mb-2 block">Visual style — סגנון ויזואלי</Label>
            <div className="flex gap-2 flex-wrap">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => set('avatar_style')(s.id)}
                  title={s.desc}
                  className={cn(
                    'px-3 py-1.5 rounded-full border text-xs font-medium smooth',
                    form.avatar_style === s.id
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {STYLES.find((s) => s.id === form.avatar_style)?.desc}
            </p>
          </div>

          <Button onClick={handleGenerate} disabled={!form.niche || generate.isPending} className="w-full">
            <Wand2 className="w-4 h-4" />
            {generate.isPending ? 'Generating DNA + face…' : 'Generate Avatar'}
          </Button>

          {generate.isPending && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
              <Sparkles className="w-4 h-4 animate-pulse" />
              Creating DNA and generating face in background — may take 30–60s
            </div>
          )}

          {generated && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowJson(!showJson)}
                  className="flex items-center gap-1 text-sm font-medium"
                >
                  {showJson ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Generated DNA
                </button>
                <Badge variant="success">Created</Badge>
              </div>
              {showJson && (
                <pre className="p-3 rounded-md bg-secondary/50 border border-border text-xs overflow-x-auto max-h-80 overflow-y-auto">
                  {JSON.stringify(generated, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={close}>
            {generated ? 'Close' : 'Cancel'}
          </Button>
          {!generated && (
            <Button onClick={handleGenerate} disabled={!form.niche || generate.isPending}>
              <Wand2 className="w-4 h-4" /> Generate
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
