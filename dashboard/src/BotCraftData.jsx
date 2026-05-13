/**
 * BotCraft Data Integration
 *
 * Provides real Supabase data to BotCraft UI Kit
 * Replaces mock.js with live queries
 */

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/api'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:54321/functions/v1'

/**
 * Wrap an external image URL through our proxy if it's a known
 * CORS-blocked host (Pollinations, Pexels, etc).
 * Use this whenever displaying an image in <img> tags.
 */
export const proxyImage = (url) => {
  if (!url) return url
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  try {
    const host = new URL(url).hostname
    const proxiedHosts = [
      'image.pollinations.ai',
      'pollinations.ai',
      'images.unsplash.com',
      'images.pexels.com',
      'pixabay.com',
      'cdn.pixabay.com',
    ]
    if (proxiedHosts.includes(host)) {
      return `${API_URL}/proxy-image?url=${encodeURIComponent(url)}`
    }
  } catch {
    // not a valid URL - return as is
  }
  return url
}

/**
 * Hook: Use avatars (real data)
 */
export const useAvatars = () => {
  return useQuery({
    queryKey: ['avatars'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('avatars')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      // Transform to BotCraft format (passes through all raw fields too)
      return (data || []).map(a => ({
        ...a,                                          // raw row first — brand_identity, tone, etc.
        id: a.id,
        name: a.name || 'Unnamed',
        niche: a.niche || 'general',
        lang: a.language || 'EN',
        language: a.language || 'EN',
        initial: (a.name || '?')[0].toUpperCase(),
        grad: `linear-gradient(135deg, #7C3AED, #06B6D4)`,
        image_url: a.image_url || a.face_url || null,
        bio: a.bio || null,
        music_genre: a.music_genre || null,
        videos: 0, // will be filled by videos query
        views: '0',
        growth: '+0%',
        status: a.is_paused ? 'paused' : a.is_active ? 'active' : 'inactive',
      }))
    },
  })
}

/**
 * Hook: Use videos (real data)
 */
export const useVideos = () => {
  const { data: avatars = [] } = useAvatars()

  return useQuery({
    queryKey: ['videos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      // Count videos per avatar for the avatars list
      const videoCounts = {}
      ;(data || []).forEach(v => {
        videoCounts[v.avatar_id] = (videoCounts[v.avatar_id] || 0) + 1
      })

      // Transform to BotCraft format
      return {
        videos: (data || []).map(v => {
          const avatar = avatars.find(a => a.id === v.avatar_id)
          const renderOpts = v.render_options || {}

          // Map status to step number
          const statusToStep = { queued: 1, processing: 3, ready: 5, failed: 5, posted: 5 }

          return {
            id: v.id,
            title: v.topic || renderOpts.topic || 'Untitled',
            avatar: avatar?.name || 'Unknown',
            status: v.status || 'queued',
            step: statusToStep[v.status] || 1,
            views: '0', // TODO: query analytics table if exists
            platforms: [], // TODO: get from published_platforms
            thumb: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
            created: v.created_at ? (() => {
              const d = new Date(v.created_at)
              const now = new Date()
              const diff = (now - d) / 1000
              if (diff < 60) return 'just now'
              if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
              if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
              return d.toLocaleDateString()
            })() : 'just now',
          }
        }),
        videoCounts,
      }
    },
  })
}

/**
 * Hook: Use insights/learnings
 */
export const useInsights = () => {
  return useQuery({
    queryKey: ['insights'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('learning_facts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)

      if (error) throw error

      return (data || []).map(f => ({
        text: f.fact,
        confidence: Math.round((f.confidence || 0) * 100),
      }))
    },
  })
}

/**
 * Helper: get auth header with the current user's JWT
 */
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * Hook: Create avatar (with optional fields for AI auto-fill)
 */
export const useCreateAvatar = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input) => {
      const res = await fetch(`${API_URL}/create-avatar`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(input),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create avatar')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avatars'] })
    },
  })
}

/**
 * Hook: Preview an avatar (no DB write — just LLM + image generation)
 */
export const useAvatarPreview = () => {
  return useMutation({
    mutationFn: async (input) => {
      const res = await fetch(`${API_URL}/create-avatar`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ ...input, preview_only: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Preview failed')
      }
      return res.json()
    },
  })
}

/**
 * Hook: Match voices for an avatar (ElevenLabs)
 */
export const useMatchVoices = (avatarId, enabled = true) => {
  return useQuery({
    queryKey: ['voice-matches', avatarId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/match-voices`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ avatar_id: avatarId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Voice match failed')
      }
      return res.json()
    },
    enabled: !!avatarId && enabled,
    staleTime: 5 * 60 * 1000,  // 5 min cache
  })
}

/**
 * Hook: Set the selected voice on an avatar
 */
export const useSetAvatarVoice = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ avatar_id, voice_id, voice_name }) => {
      const { data, error } = await supabase
        .from('avatars')
        .update({ voice_id, voice_name })
        .eq('id', avatar_id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avatars'] })
    },
  })
}

/**
 * Hook: Publish a video (mark as posted on platforms)
 */
export const usePublishVideo = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ video_id, platforms = ['yt'] }) => {
      const res = await fetch(`${API_URL}/publish-video`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ video_id, platforms }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Publish failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      queryClient.invalidateQueries({ queryKey: ['avatar-videos'] })
    },
  })
}

/**
 * Hook: Discard a video (mark as discarded)
 */
export const useDiscardVideo = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ video_id }) => {
      const res = await fetch(`${API_URL}/discard-video`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ video_id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Discard failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      queryClient.invalidateQueries({ queryKey: ['avatar-videos'] })
    },
  })
}

/**
 * Hook: Send a natural-language command to an avatar
 */
export const useAvatarCommand = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ avatar_id, command }) => {
      const res = await fetch(`${API_URL}/avatar-command`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ avatar_id, command }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Command failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avatars'] })
    },
  })
}

/**
 * Hook: Produce video
 */
export const useProduceVideo = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ avatar_id, topic, scheduled_for = null, user_command = null }) => {
      const res = await fetch(`${API_URL}/produce-video`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          avatar_id,
          topic: topic || null,
          voice: 'auto',
          auto_post: false,
          scheduled_for,
          user_command,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to produce video')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    },
  })
}

/**
 * Hook: Mock data factory (for backward compat with BotCraft UI Kit)
 */
export const useMockData = () => {
  const { data: avatarsData = [], isLoading: avatarsLoading } = useAvatars()
  const { data: videosData = {}, isLoading: videosLoading } = useVideos()
  const { data: insightsData = [], isLoading: insightsLoading } = useInsights()

  const { videos = [], videoCounts = {} } = videosData

  // Merge video counts into avatars
  const avatars = avatarsData.map(a => ({
    ...a,
    videos: videoCounts[a.id] || 0,
  }))

  // KPI tiles
  const kpis = [
    {
      label: 'Total avatars',
      value: String(avatars.length),
      delta: `+${avatars.filter(a => a.status === 'active').length} active`,
      spark: [0, 1, 1, 2, 3, 3, 4, avatars.length],
    },
    {
      label: 'Videos this month',
      value: String(videos.length),
      delta: videos.length > 0 ? '+0%' : '0%',
      spark: Array.from({ length: 8 }, (_, i) => Math.floor((i + 1) / 8 * videos.length)),
      gradient: true,
    },
    {
      label: 'Total views',
      value: '0',
      delta: '+0%',
      spark: [0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: 'Active schedules',
      value: String(avatars.filter(a => a.status === 'active').length),
      delta: '+0',
      spark: [0, 1, 1, 2, 2, 3, 3, avatars.filter(a => a.status === 'active').length],
    },
  ]

  // Mock schedule (TODO: fetch from database if exists)
  const schedule = []

  // Performance bars
  const perfBars = avatars
    .sort((a, b) => parseInt(b.videos) - parseInt(a.videos))
    .map(a => ({ name: a.name, value: parseInt(a.videos) }))

  return {
    data: {
      avatars,
      videos,
      kpis,
      insights: insightsData,
      schedule,
      perfBars,
      notifications: 0,
    },
    isLoading: avatarsLoading || videosLoading || insightsLoading,
  }
}

/**
 * Strings (strings are in your language; we provide EN + HE)
 */
export const STRINGS = {
  EN: {
    nav: {
      dashboard: 'Dashboard',
      avatars: 'Avatars',
      videos: 'Videos',
      trends: 'Trends',
      analytics: 'Analytics',
      learnings: 'Learnings',
      settings: 'Settings',
    },
    quickCreate: 'Quick create',
    search: 'Search avatars, videos, trends…',
    todaySchedule: "Today's schedule",
    recentVideos: 'Recent videos',
    avatarPerf: 'Avatar performance',
    insights: 'AI insights of the week',
    loginTitle: 'Welcome back',
    loginSub: 'Craft AI personas that create, post, and grow on autopilot.',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    orContinue: 'or continue with',
    google: 'Continue with Google',
    newAvatar: 'New avatar',
    viewAll: 'View all',
  },
  HE: {
    nav: {
      dashboard: 'לוח בקרה',
      avatars: 'אווטארים',
      videos: 'סרטונים',
      trends: 'מגמות',
      analytics: 'ניתוחים',
      learnings: 'תובנות',
      settings: 'הגדרות',
    },
    quickCreate: 'יצירה מהירה',
    search: 'חפש אווטארים, סרטונים, מגמות…',
    todaySchedule: 'הלו״ז של היום',
    recentVideos: 'סרטונים אחרונים',
    avatarPerf: 'ביצועי אווטארים',
    insights: 'תובנות בינה מלאכותית השבוע',
    loginTitle: 'ברוך שובך',
    loginSub: 'בנה דמויות AI שיוצרות, מפרסמות וצומחות באוטומט.',
    email: 'אימייל',
    password: 'סיסמה',
    signIn: 'כניסה',
    orContinue: 'או המשך עם',
    google: 'המשך עם Google',
    newAvatar: 'אווטאר חדש',
    viewAll: 'הצג הכול',
  },
}
