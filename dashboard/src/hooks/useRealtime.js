/**
 * useRealtime — Supabase realtime subscriptions
 *
 * Listens for INSERT/UPDATE/DELETE events on database tables.
 * Automatically invalidates React Query cache so UI re-renders.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/api'

/**
 * Hook: Subscribe to videos table changes
 * Triggers a refetch of the videos query when status changes.
 */
export const useVideosRealtime = (userId) => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('videos-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'videos',
        },
        (payload) => {
          console.log('[realtime] videos change:', payload.eventType, payload.new?.id || payload.old?.id)
          // Invalidate videos query → triggers refetch
          queryClient.invalidateQueries({ queryKey: ['videos'] })
        }
      )
      .subscribe((status) => {
        console.log('[realtime] videos channel status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}

/**
 * Hook: Subscribe to avatars table changes
 */
export const useAvatarsRealtime = (userId) => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('avatars-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'avatars' },
        (payload) => {
          console.log('[realtime] avatars change:', payload.eventType)
          queryClient.invalidateQueries({ queryKey: ['avatars'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}

/**
 * Hook: Subscribe to learning_facts table changes
 */
export const useInsightsRealtime = (userId) => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('insights-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'learning_facts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['insights'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}

/**
 * Hook: Subscribe to video_queue changes (job status)
 */
export const useVideoQueueRealtime = (userId, onJobUpdate) => {
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('video-queue-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'video_queue' },
        (payload) => {
          console.log('[realtime] queue update:', payload.new?.status)
          if (onJobUpdate) onJobUpdate(payload.new)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, onJobUpdate])
}

/**
 * Master hook: Subscribe to all relevant changes
 */
export const useAllRealtime = (userId) => {
  useVideosRealtime(userId)
  useAvatarsRealtime(userId)
  useInsightsRealtime(userId)
}
