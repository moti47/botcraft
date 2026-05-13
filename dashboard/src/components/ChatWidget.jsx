import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints } from '@/lib/api'
import {
  MessageCircle, Send, Bot, User, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, ShieldAlert, Check, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

// ---------------------------------------------------------------------------
// Tool labels
// ---------------------------------------------------------------------------
const ACTION_LABEL = {
  create_avatar: '🧑 Avatar created',
  bulk_create_avatars: (a) => `🧑 ${a.created?.length ?? 0} avatars created`,
  produce_video: '🎬 Video queued',
  pause_avatar: (a) => a.paused ? '⏸ Avatar paused' : '▶ Avatar resumed',
  list_avatars: '📋 Listed avatars',
  get_avatar: '👤 Avatar details',
  list_recent_videos: '🎥 Listed videos',
  list_ideas: '💡 Listed ideas',
  list_commands: '⌨️ Listed commands',
  get_analytics: '📊 Analytics',
  create_idea: '💡 Idea created',
  create_command: '⌨️ Command created',
  delete_avatar: '🗑 Avatar deleted',
  delete_video: '🗑 Video deleted',
  publish_video: '📤 Video published',
  regenerate_image: '🖼 Image regenerated',
  set_auto_publish: (a) => a.auto_publish ? '🔄 Auto-publish ON' : '🔄 Auto-publish OFF',
  update_avatar: '✏️ Avatar updated',
  delete_idea: '🗑 Idea deleted',
  delete_command: '🗑 Command deleted',
  promote_variant: '🏆 Variant promoted',
}

// Cache-invalidation map per tool
const INVALIDATES = {
  create_avatar: ['avatars'],
  bulk_create_avatars: ['avatars'],
  pause_avatar: ['avatars'],
  delete_avatar: ['avatars'],
  update_avatar: ['avatars'],
  regenerate_image: ['avatars'],
  set_auto_publish: ['avatars'],
  produce_video: ['videos-recent'],
  delete_video: ['videos-recent', 'videos'],
  publish_video: ['videos-recent', 'videos'],
  create_idea: [],
  delete_idea: [],
  create_command: [],
  delete_command: [],
  promote_variant: ['avatars'],
}

// ---------------------------------------------------------------------------
// ApprovalBubble — shows Approve / Reject for risky pending actions
// ---------------------------------------------------------------------------
function ApprovalBubble({ action, onResolve }) {
  const qc = useQueryClient()

  const approve = useMutation({
    mutationFn: () => endpoints.approvalApprove(action.approval_id).then((r) => r.data),
    onSuccess: (data) => {
      toast({ title: 'פעולה אושרה ✅', description: action.description })
      const keys = INVALIDATES[action.tool] || []
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      qc.invalidateQueries({ queryKey: ['approvals-pending-count'] })
      onResolve(action.approval_id, 'approved', data.result)
    },
    onError: (err) => {
      toast({ title: 'שגיאה', description: err.userMessage || 'אישור נכשל', variant: 'destructive' })
    },
  })

  const reject = useMutation({
    mutationFn: () => endpoints.approvalReject(action.approval_id).then((r) => r.data),
    onSuccess: () => {
      toast({ title: 'פעולה נדחתה', description: action.description })
      qc.invalidateQueries({ queryKey: ['approvals-pending-count'] })
      onResolve(action.approval_id, 'rejected', null)
    },
    onError: (err) => {
      toast({ title: 'שגיאה', description: err.userMessage || 'דחייה נכשלה', variant: 'destructive' })
    },
  })

  const busy = approve.isPending || reject.isPending

  return (
    <div className="border border-yellow-500/40 bg-yellow-500/5 rounded-xl p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-yellow-400 font-medium">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>נדרש אישור</span>
      </div>
      <p className="text-muted-foreground">{action.description}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-success/50 text-success hover:bg-success/10 h-7 text-xs"
          onClick={() => approve.mutate()}
          disabled={busy}
        >
          <Check className="w-3 h-3" /> אשר
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/50 text-destructive hover:bg-destructive/10 h-7 text-xs"
          onClick={() => reject.mutate()}
          disabled={busy}
        >
          <X className="w-3 h-3" /> דחה
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActionBadge — simple success/failure badge for executed actions
// ---------------------------------------------------------------------------
function ActionBadge({ action }) {
  const raw = ACTION_LABEL[action.tool]
  const label = typeof raw === 'function' ? raw(action) : (raw || action.tool)
  const ok = action.status === 'ok'
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border',
      ok
        ? 'border-success/40 bg-success/10 text-success'
        : 'border-destructive/40 bg-destructive/10 text-destructive',
    )}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------
function Message({ msg, onResolveApproval }) {
  const isUser = msg.role === 'user'
  // Track which approval_ids have been resolved in this session
  const [resolved, setResolved] = useState({}) // { approval_id: { status, result } }

  const handleResolve = (approvalId, resolvedStatus, result) => {
    setResolved((prev) => ({ ...prev, [approvalId]: { status: resolvedStatus, result } }))
  }

  const actions = msg.actions_taken || []
  const pendingActions = actions.filter(
    (a) => a.status === 'needs_approval' && !resolved[a.approval_id],
  )
  const executedActions = [
    ...actions.filter((a) => a.status !== 'needs_approval'),
    ...Object.entries(resolved).map(([id, info]) => ({
      tool: actions.find((a) => a.approval_id === id)?.tool || '',
      status: info.status === 'approved' ? 'ok' : 'rejected',
      ...info.result,
    })),
  ]

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className={cn('max-w-[82%] space-y-1.5', isUser ? 'items-end' : 'items-start')}>
        <div className={cn(
          'px-3 py-2 rounded-2xl text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-secondary/60 border border-border rounded-tl-sm',
        )}>
          {msg.content}
        </div>

        {/* Executed action badges */}
        {executedActions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {executedActions.map((a, i) => <ActionBadge key={i} action={a} />)}
          </div>
        )}

        {/* Pending approval bubbles */}
        {pendingActions.length > 0 && (
          <div className="space-y-2 px-1">
            {pendingActions.map((a) => (
              <ApprovalBubble
                key={a.approval_id}
                action={a}
                onResolve={(id, st, result) => {
                  handleResolve(id, st, result)
                  onResolveApproval?.()
                }}
              />
            ))}
          </div>
        )}

        {msg.created_at && (
          <div className={cn(
            'text-[10px] text-muted-foreground px-1',
            isUser ? 'text-right' : 'text-left',
          )}>
            {new Date(msg.created_at).toLocaleTimeString()}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatWidget
// ---------------------------------------------------------------------------
export function ChatWidget() {
  const [collapsed, setCollapsed] = useState(false)
  const [input, setInput] = useState('')
  const [localMessages, setLocalMessages] = useState([])
  const endRef = useRef(null)
  const qc = useQueryClient()

  const { data: history, isLoading } = useQuery({
    queryKey: ['chat-history'],
    queryFn: async () => (await endpoints.chatHistory(40)).data,
  })

  useEffect(() => {
    if (history && localMessages.length === 0) setLocalMessages(history)
  }, [history])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  const invalidateFromActions = (actions) => {
    const keys = new Set()
    for (const a of actions) {
      if (a.status === 'needs_approval') continue
      const inv = INVALIDATES[a.tool] || []
      inv.forEach((k) => keys.add(k))
    }
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
  }

  const send = useMutation({
    mutationFn: (message) => endpoints.chatSend(message).then((r) => r.data),
    onMutate: (message) => {
      const optimistic = {
        role: 'user', content: message, actions_taken: [],
        id: 'pending-' + Date.now(),
      }
      setLocalMessages((m) => [...m, optimistic])
    },
    onSuccess: (data) => {
      const assistantMsg = {
        role: 'assistant',
        content: data.reply,
        actions_taken: data.actions_taken || [],
        id: data.message_id || ('resp-' + Date.now()),
      }
      setLocalMessages((m) => [...m, assistantMsg])
      invalidateFromActions(data.actions_taken || [])
      // Refresh pending count in case new approvals were created
      if ((data.actions_taken || []).some((a) => a.status === 'needs_approval')) {
        qc.invalidateQueries({ queryKey: ['approvals-pending-count'] })
      }
    },
    onError: (err) => {
      const status = err?.response?.status
      let content = '⚠️ '
      if (status === 401) {
        content += 'Authentication error — please sign out and sign in again.'
      } else if (status === 503) {
        content += 'All AI providers are currently unavailable. Check your API keys (GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY) in the .env file.'
      } else if (status >= 500) {
        const detail = err?.response?.data?.detail
        content += detail
          ? `Server error: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
          : 'Internal server error. Check the FastAPI logs for details.'
      } else if (!status) {
        content += 'Cannot reach the server. Make sure the FastAPI container is running (port 8000).'
      } else {
        content += err?.userMessage || 'Something went wrong. Please try again.'
      }
      setLocalMessages((m) => [
        ...m,
        { role: 'assistant', content, actions_taken: [] },
      ])
    },
  })

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || send.isPending) return
    setInput('')
    send.mutate(msg)
  }

  const handleResolveApproval = () => {
    qc.invalidateQueries({ queryKey: ['approvals-pending-count'] })
  }

  return (
    <Card className="border-primary/20">
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="w-4 h-4 text-primary" />
            AI Assistant
            <span className="hidden sm:inline text-xs font-normal text-muted-foreground">
              — ניהול אווטרים, סרטונים, פרסום ועוד
            </span>
          </CardTitle>
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-3 pt-0">
          <div className="h-80 overflow-y-auto space-y-3 pr-1">
            {isLoading && localMessages.length === 0 ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-10 w-1/2 ml-auto" />
              </div>
            ) : localMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-sm text-muted-foreground gap-2">
                <Bot className="w-10 h-10 opacity-20" />
                <div>שאל אותי כל דבר! אני יכול ליצור אווטרים, לתור סרטונים, לנהל לוחות זמנים ועוד.</div>
                <div className="text-xs opacity-70">לדוגמה: "צור אווטר בנושא פיטנס" / "מחק סרטון X"</div>
              </div>
            ) : (
              localMessages.map((m, i) => (
                <Message
                  key={m.id || i}
                  msg={m}
                  onResolveApproval={handleResolveApproval}
                />
              ))
            )}
            {send.isPending && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-secondary/60 border border-border">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="צור אווטר, תור סרטון, מחק, פרסם…"
              disabled={send.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || send.isPending}
              size="icon"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
