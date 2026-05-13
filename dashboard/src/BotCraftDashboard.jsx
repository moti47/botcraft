/**
 * BotCraft Dashboard — Integration Layer
 *
 * Connects the BotCraft UI Kit to Supabase backend.
 * Replaces mock data with real API calls.
 */

import React, { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from './lib/api'

const BotCraftDashboard = () => {
  const [user, setUser] = useState(null)
  const [lang, setLang] = useState('EN')

  // === Auth ===
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null)
    })

    return () => subscription?.unsubscribe()
  }, [])

  // === Queries ===
  const { data: avatars = [], isLoading: avatarsLoading } = useQuery({
    queryKey: ['avatars'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('avatars')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  const { data: videos = [], isLoading: videosLoading } = useQuery({
    queryKey: ['videos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  const { data: insights = [] } = useQuery({
    queryKey: ['insights'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('learning_facts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)
      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  // === Mutations ===
  const createAvatarMutation = useMutation({
    mutationFn: async (data) => {
      // Call Edge Function to create avatar
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/create-avatar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      )
      if (!res.ok) throw new Error('Failed to create avatar')
      return res.json()
    },
    onSuccess: () => {
      // Refetch avatars
      // queryClient.invalidateQueries(['avatars'])
    },
  })

  const produceVideoMutation = useMutation({
    mutationFn: async ({ avatar_id, topic }) => {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/produce-video`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar_id, topic }),
        }
      )
      if (!res.ok) throw new Error('Failed to produce video')
      return res.json()
    },
    onSuccess: () => {
      // Refetch videos
    },
  })

  // === Render ===
  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <h1>Sign in to BotCraft</h1>
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
        >
          Continue with Google
        </button>
      </div>
    )
  }

  // === Mock data transformation (for BotCraft UI compatibility) ===
  const mockData = {
    avatars: avatars.map((a) => ({
      id: a.id,
      name: a.name,
      niche: a.niche,
      lang: a.language,
      initial: a.name[0],
      grad: `linear-gradient(135deg, #7C3AED, #06B6D4)`,
      videos: videos.filter((v) => v.avatar_id === a.id).length,
      views: '0', // TODO: get from analytics
      growth: '+0%', // TODO: get from analytics
      status: a.is_paused ? 'paused' : 'active',
    })),
    kpis: [
      { label: 'Total avatars', value: String(avatars.length), delta: '+0 this month', spark: [] },
      { label: 'Videos this month', value: String(videos.length), delta: '+0%', spark: [], gradient: true },
      { label: 'Total views', value: '0', delta: '+0%', spark: [] },
      { label: 'Active schedules', value: '0', delta: '+0', spark: [] },
    ],
    videos: videos.map((v) => ({
      id: v.id,
      title: v.topic || 'Untitled',
      avatar: avatars.find((a) => a.id === v.avatar_id)?.name || 'Unknown',
      status: v.status,
      step: v.status === 'queued' ? 1 : v.status === 'processing' ? 3 : v.status === 'ready' ? 5 : 1,
      views: '0',
      platforms: [],
      thumb: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
      created: v.created_at ? new Date(v.created_at).toLocaleString() : 'just now',
    })),
    insights: insights.map((i) => ({
      text: i.fact,
      confidence: Math.round(i.confidence * 100),
    })),
    notifications: 0,
  }

  // TODO: Load BotCraft UI Kit and pass mockData + callbacks
  // For now, return placeholder
  return (
    <div style={{ padding: '40px' }}>
      <h1>🎬 BotCraft Dashboard</h1>
      <p>Logged in as: {user.email}</p>

      <h2>Avatars ({avatars.length})</h2>
      <ul>
        {avatars.map((a) => (
          <li key={a.id}>
            {a.name} ({a.niche})
          </li>
        ))}
      </ul>

      <h2>Videos ({videos.length})</h2>
      <ul>
        {videos.map((v) => (
          <li key={v.id}>
            {v.topic} — {v.status}
          </li>
        ))}
      </ul>

      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )
}

export default BotCraftDashboard
