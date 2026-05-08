import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

// Edge Functions URL (Supabase)
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:54321/functions/v1'

// Supabase client for direct DB access + realtime
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err?.response?.data?.detail || err?.message || 'Unknown error'
    err.userMessage = typeof msg === 'string' ? msg : JSON.stringify(msg)
    return Promise.reject(err)
  },
)

export const endpoints = {
  // ===== Avatars (Supabase) =====
  avatarsList: async () => {
    const { data, error } = await supabase.from('avatars').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return { data }
  },
  avatarGet: async (id) => {
    const { data, error } = await supabase.from('avatars').select('*').eq('id', id).single()
    if (error) throw error
    return { data }
  },
  avatarCreate: async (data) => api.post('/create-avatar', data),
  avatarUpdate: async (id, data) => {
    const { error } = await supabase.from('avatars').update(data).eq('id', id)
    if (error) throw error
    return await endpoints.avatarGet(id)
  },

  // ===== Videos (Edge Functions + Supabase) =====
  videosList: async (params = {}) => {
    let q = supabase.from('videos').select('*')
    if (params.avatar_id) q = q.eq('avatar_id', params.avatar_id)
    if (params.status) q = q.eq('status', params.status)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) throw error
    return { data }
  },
  videosRecent: async () => endpoints.videosList({ limit: 20 }),
  videoProduce: (data) => api.post('/produce-video', data),
  videoGet: async (id) => {
    const { data, error } = await supabase.from('videos').select('*').eq('id', id).single()
    if (error) throw error
    return { data }
  },
  videoRetry: async (id) => {
    const videoRes = await endpoints.videoGet(id)
    const video = videoRes.data
    const now = new Date().toISOString()
    const renderOpts = video.render_options || {}
    const newOpts = {
      ...renderOpts,
      stages: { ...(renderOpts.stages || {}), queued: now },
      retry_count: (renderOpts.retry_count || 0) + 1,
    }
    const { error: updateErr } = await supabase.from('videos').update({
      status: 'queued',
      error_message: null,
      render_options: newOpts,
    }).eq('id', id)
    if (updateErr) throw updateErr
    await supabase.from('video_queue').insert([{
      video_id: id,
      avatar_id: video.avatar_id,
      status: 'pending',
      created_at: now,
    }])
    return { status: 'ok', video_id: id }
  },

  // ===== Trends (Edge Functions) =====
  findViralTopic: (avatarId, topN = 5) => api.post('/find-viral-topic', { avatar_id: avatarId, top_n: topN }),
  trendsList: async (avatarId) => {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('trend_signals')
      .select('*')
      .eq('avatar_id', avatarId)
      .gt('expires_at', now)
      .order('score', { ascending: false })
    if (error) throw error
    return { data }
  },

  // ===== Learning / Insights =====
  learnAll: () => api.post('/learn-all'),
  insightsGet: async (avatarId) => {
    const { data, error } = await supabase
      .from('avatar_insights')
      .select('*')
      .eq('avatar_id', avatarId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()
    if (error) throw error
    return { data }
  },
  learningFactsList: async (avatarId) => {
    const { data, error } = await supabase
      .from('learning_facts')
      .select('*')
      .eq('avatar_id', avatarId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return { data }
  },

  // ===== Chat =====
  chatSend: async (message) => {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{ role: 'user', content: message }])
      .select()
      .single()
    if (error) throw error
    return { data }
  },
  chatHistory: async (limit = 30) => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return { data }
  },

  // ===== Backward compat (no-op or stub) =====
  health: async () => ({ status: 'ok' }),
  colabHealth: async () => ({ status: 'not_applicable' }),
  pauseAll: async () => ({ status: 'ok' }),
  exportData: async () => new Blob(),
}
