import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useStore } from '@/store/useStore'
import { useMutationWithToast } from '@/hooks/useApi'
import { endpoints } from '@/lib/api'
import { Save, RefreshCw } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

export function EditDnaPanel() {
  const { editAvatar, setEditAvatar } = useStore()
  const [json, setJson] = useState('')

  useEffect(() => {
    if (editAvatar) {
      setJson(JSON.stringify(editAvatar.persona_dna || {}, null, 2))
    }
  }, [editAvatar])

  const save = useMutationWithToast(
    (data) => endpoints.avatarUpdate(editAvatar.id, data),
    { successMsg: 'Avatar updated', invalidate: ['avatars'] },
  )

  const regen = useMutationWithToast(
    () => endpoints.avatarCreate({ regenerate: true, avatar_id: editAvatar.id }).then((r) => r.data),
    { successMsg: 'DNA regenerated', invalidate: ['avatars'] },
  )

  const handleSave = () => {
    try {
      const parsed = JSON.parse(json)
      save.mutate({ persona_dna: parsed })
    } catch {
      toast({ title: 'Invalid JSON', variant: 'destructive' })
    }
  }

  const handleRegen = async () => {
    const r = await regen.mutateAsync()
    if (r?.persona_dna) setJson(JSON.stringify(r.persona_dna, null, 2))
  }

  return (
    <Sheet open={!!editAvatar} onOpenChange={(v) => !v && setEditAvatar(null)}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Edit DNA — {editAvatar?.name}</SheetTitle>
          <SheetDescription>ערוך את ה-DNA של הדמות</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          <Textarea value={json} onChange={(e) => setJson(e.target.value)} className="font-mono text-xs min-h-[400px]" />
          <Button variant="outline" onClick={handleRegen} disabled={regen.isPending} className="w-full">
            <RefreshCw className={regen.isPending ? 'animate-spin w-4 h-4' : 'w-4 h-4'} /> Regenerate with LLM
          </Button>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => setEditAvatar(null)}>Cancel</Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            <Save className="w-4 h-4" /> Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
