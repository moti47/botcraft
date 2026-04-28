import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints } from '@/lib/api'
import { MessageCircle, Send, Bot, User, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACTION_LABEL = {
  create_avatar: '🧑 Avatar created',
  bulk_create_avatars: (a) => `🧑 ${a.created?.length ?? 0} avatars created`,
  produce_video: '🎬 Video queued',
  pause_avatar: '⏸ Avatar paused',
  list_avatars: '📋 Listed avatars',
  list_recent_videos: '🎥 Listed videos',
}

function ActionBadge({ action }) {
  const raw = ACTION_LABEL[action.tool]
  const label = typeof raw === 'function' ? raw(action) : (raw || action.tool)
  const ok = action.status === 'ok'
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border',
      ok ? 'border-success/40 bg-success/10 text-success' : 'border-destructive/40 bg-destructive/10 text-destructive',
    )}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className={cn('max-w-[80%] space-y-1.5', isUser ? 'items-end' : 'items-start')}>
        <div className={cn(
          'px-3 py-2 rounded-2xl text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-secondary/60 border border-border rounded-tl-sm',
        )}>
          {msg.content}
        </div>
        {(msg.actions_taken || []).length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {msg.actions_taken.map((a, i) => <ActionBadge key={i} action={a} />)}
          </div>
        )}
        {msg.created_at && (
          <div className={cn('text-[10px] text-muted-foreground px-1', isUser ? 'text-right' : 'text-left')}>
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

export function ChatWidget() {
  const [collapsed, setCollapsed] = useState(false)
  const [input, setInput] = useState('')
  const [localMessages, setLocalMessages] = useState([])
  const endRef = useRef(null)
  const qc = useQueryClient()

  const { data: history, isLoading } = useQuery({
    queryKey: ['chat-history'],
    queryFn: async () => (await endpoints.chatHistory(40)).data,
    onSuccess: (data) => {
      if (localMessages.length === 0) setLocalMessages(data || [])
    },
  })

  useEffect(() => {
    if (history && localMessages.length === 0) setLocalMessages(history)
  }, [history])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  const send = useMutation({
    mutationFn: (message) => endpoints.chatSend(message).then((r) => r.data),
    onMutate: (message) => {
      const optimistic = { role: 'user', content: message, actions_taken: [], id: 'pending-' + Date.now() }
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
      if (data.actions_taken?.some((a) => ['create_avatar', 'bulk_create_avatars', 'pause_avatar'].includes(a.tool))) {
        qc.invalidateQueries({ queryKey: ['avatars'] })
      }
      if (data.actions_taken?.some((a) => a.tool === 'produce_video')) {
        qc.invalidateQueries({ queryKey: ['videos-recent'] })
      }
    },
    onError: () => {
      setLocalMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', actions_taken: [] },
      ])
    },
  })

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || send.isPending) return
    setInput('')
    send.mutate(msg)
  }

  const messages = localMessages

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
            <span className="hidden sm:inline text-xs font-normal text-muted-foreground">— can create avatars, queue videos, and more</span>
          </CardTitle>
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-3 pt-0">
          {/* Messages */}
          <div className="h-72 overflow-y-auto space-y-3 pr-1">
            {isLoading && messages.length === 0 ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-10 w-1/2 ml-auto" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-sm text-muted-foreground gap-2">
                <Bot className="w-10 h-10 opacity-20" />
                <div>
                  Ask me anything! I can create avatars, queue video productions, manage schedules, and more.
                </div>
                <div className="text-xs opacity-70">לדוגמה: "צור אווטאר בנושא פיטנס" / "Queue a video for avatar X"</div>
              </div>
            ) : (
              messages.map((m, i) => <Message key={m.id || i} msg={m} />)
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

          {/* Input */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask me to create an avatar, queue a video…"
              disabled={send.isPending}
            />
            <Button onClick={handleSend} disabled={!input.trim() || send.isPending} size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
