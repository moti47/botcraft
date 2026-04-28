import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { endpoints } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'
import { API_URL } from '@/lib/api'

export function useColabHealth() {
  return useQuery({
    queryKey: ['colab-health'],
    queryFn: async () => (await endpoints.colabHealth()).data,
    refetchInterval: 30_000,
  })
}

export function useLLMUsage() {
  return useQuery({
    queryKey: ['llm-usage'],
    queryFn: async () => (await endpoints.llmUsage()).data,
    refetchInterval: 60_000,
  })
}

export function useAvatars() {
  return useQuery({
    queryKey: ['avatars'],
    queryFn: async () => (await endpoints.avatarsList()).data,
  })
}

export function useVideos(params) {
  return useQuery({
    queryKey: ['videos', params],
    queryFn: async () => (await endpoints.videosList(params)).data,
  })
}

export function useRecentVideos() {
  return useQuery({
    queryKey: ['videos-recent'],
    queryFn: async () => (await endpoints.videosRecent()).data,
    refetchInterval: 30_000,
  })
}

export function useTrends() {
  return useQuery({
    queryKey: ['trends'],
    queryFn: async () => (await endpoints.trends()).data,
    enabled: false,
  })
}

export function useAnalytics(days = 7) {
  return useQuery({
    queryKey: ['analytics', days],
    queryFn: async () => (await endpoints.analyticsSummary(days)).data,
  })
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => (await endpoints.configGet()).data,
  })
}

export function useMutationWithToast(fn, { successMsg, errorMsg, invalidate = [] } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (successMsg) toast({ title: successMsg, variant: 'success' })
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
    },
    onError: (err) => {
      toast({ title: errorMsg || 'Error', description: err?.userMessage || err?.message, variant: 'destructive' })
    },
  })
}

export function useNotifications(params = {}) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: async () => (await endpoints.notificationsList(params)).data,
    refetchInterval: 60_000,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => (await endpoints.notificationsUnreadCount()).data,
    refetchInterval: 30_000,
  })
}

// Connects to the SSE stream and keeps notification queries fresh.
export function useNotificationsSSE() {
  const qc = useQueryClient()
  const esRef = useRef(null)

  useEffect(() => {
    const url = `${API_URL}/notifications/stream`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (ev) => {
      try {
        const notif = JSON.parse(ev.data)
        if (notif?.type === 'ping') return
        // Prepend the incoming notification into the list cache
        qc.setQueryData(['notifications', {}], (old) => {
          if (!Array.isArray(old)) return old
          return [notif, ...old]
        })
        // Bump the unread count
        qc.setQueryData(['notifications-unread-count'], (old) => {
          const prev = typeof old?.count === 'number' ? old.count : 0
          return { count: prev + 1 }
        })
        // Show a toast for errors/warnings
        if (notif.level === 'error' || notif.level === 'warning') {
          toast({
            title: notif.title,
            description: notif.message,
            variant: notif.level === 'error' ? 'destructive' : 'default',
          })
        }
      } catch {/* ignore malformed frames */}
    }

    es.onerror = () => {
      // Browser will auto-reconnect; just let it
    }

    return () => { es.close() }
  }, [qc])
}
