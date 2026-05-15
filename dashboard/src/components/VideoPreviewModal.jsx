/**
 * VideoPreviewModal — reviews a generated video before publishing.
 *
 * Shows:
 *   - Thumbnail (Pollinations Flux)
 *   - Audio player (Pollinations TTS, lazy-generated on play)
 *   - Editable script
 *   - Caption preview
 * Actions: Publish · Discard · Close
 *
 * The video is identified by its ID; data is fetched from the videos table.
 * Status flow: ready_for_review → posted (publish) | discarded (discard)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import { usePublishVideo, useDiscardVideo, proxyImage } from '../BotCraftData'
import { sfx } from '../lib/sfx'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:54321/functions/v1'

// Director's animation cue → CSS animation. ALL effects are now subtle:
// a 380ms crossfade with a tiny scale settle. No skew, no blur, no
// rotation — the visuals don't fight the captions for attention.
const SCENE_ANIMATIONS = {
  zoom_punch_in:     'sceneFadeZoom',
  freeze_frame_pop:  'sceneFade',
  whip_pan:          'sceneFadeSlide',
  text_explode:      'sceneFadeZoom',
  slow_dolly_in:     'sceneFadeZoom',
  slow_pan_right:    'sceneFadeSlide',
  slow_pan_left:     'sceneFadeSlide',
  hard_cut_montage:  'sceneFade',
  logo_pop:          'sceneFade',
  default:           'sceneFade',
}

// 8 caption styles — each avatar gets ONE deterministically (so the same
// avatar always uses the same style; viewers learn to recognize the look).
// Each style is a different (font, color, weight, decoration) combination
// tuned for short-form viral video.
const CAPTION_PRESETS = [
  { id: 'yellow_classic',  font: '"Anton", "Impact", sans-serif',         size: 30, weight: 700, base: '#FFFFFF', active: '#000', activeBg: '#FBBF24',  letter: '0.5px', italic: false },
  { id: 'pink_neon',       font: '"Bebas Neue", "Impact", sans-serif',    size: 32, weight: 700, base: '#FFFFFF', active: '#FF2DC1', activeBg: 'transparent', letter: '1.5px', italic: false, glow: '0 0 18px #FF2DC1' },
  { id: 'lime_stamp',      font: '"Permanent Marker", cursive',           size: 28, weight: 400, base: '#FFFFFF', active: '#000', activeBg: '#A3E635', letter: '0.5px', italic: false },
  { id: 'gradient_sunset', font: '"Bowlby One", "Impact", sans-serif',    size: 30, weight: 700, base: '#FFFFFF', active: 'gradient', activeBg: 'transparent', letter: '0.5px', italic: false, gradient: 'linear-gradient(135deg, #FBBF24, #EF4444)' },
  { id: 'cyber_cyan',      font: '"Black Ops One", "Impact", sans-serif', size: 28, weight: 400, base: '#FFFFFF', active: '#22D3EE', activeBg: 'transparent', letter: '2px',   italic: false, glow: '0 0 20px #22D3EE' },
  { id: 'red_stamp',       font: '"Anton", "Impact", sans-serif',         size: 30, weight: 700, base: '#FFFFFF', active: '#FFF',  activeBg: '#EF4444', letter: '0.5px', italic: false, rotate: -2 },
  { id: 'purple_glow',     font: '"Bebas Neue", sans-serif',              size: 32, weight: 700, base: '#FFFFFF', active: '#C084FC', activeBg: 'transparent', letter: '1.5px', italic: false, glow: '0 0 22px #A855F7' },
  { id: 'mono_block',      font: '"JetBrains Mono", monospace',           size: 24, weight: 800, base: '#FFFFFF', active: '#000', activeBg: '#10B981', letter: '0px', italic: false },
]

// Deterministic hash from avatar id → caption preset
function pickCaptionPreset(avatarId, niche) {
  const seed = String(avatarId || niche || 'x')
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return CAPTION_PRESETS[Math.abs(h) % CAPTION_PRESETS.length]
}

// Chunk a sentence into ~3-4 word phrases, breaking on natural pauses
// (commas, periods, conjunctions) so each chunk is a visual unit the
// viewer can read in one glance.
function chunkText(text) {
  if (!text) return []
  const words = text.trim().replace(/\s+/g, ' ').split(' ')
  if (words.length === 0) return []
  const out = []
  let cur = []
  const naturalBreak = (w) => /[,.!?:;—]$/.test(w)
  for (const w of words) {
    cur.push(w)
    const len = cur.length
    if ((len >= 3 && naturalBreak(w)) || len >= 4) {
      out.push(cur.join(' '))
      cur = []
    }
  }
  if (cur.length) out.push(cur.join(' '))
  return out
}

const PLATFORMS = [
  { id: 'yt', label: 'YouTube', icon: '▶️' },
  { id: 'tt', label: 'TikTok', icon: '🎵' },
  { id: 'ig', label: 'Instagram', icon: '📸' },
]

export const VideoPreviewModal = ({ videoId, isOpen, onClose }) => {
  const [editedScript, setEditedScript] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState(['yt'])

  const { data: video, isLoading, refetch } = useQuery({
    queryKey: ['video-detail', videoId],
    queryFn: async () => {
      if (!videoId) return null
      const { data } = await supabase
        .from('videos')
        .select('*, avatars(id, name, image_url, niche, voice_id)')
        .eq('id', videoId)
        .single()
      return data
    },
    enabled: !!videoId && isOpen,
    refetchInterval: (q) => {
      // poll every 3s while still processing
      const status = q?.state?.data?.status
      return status === 'processing' || status === 'queued' ? 3000 : false
    },
  })

  // ════════════════════════════════════════════════════════════
  // Timeline-driven player. Each scene has a fixed (start_sec, duration_sec).
  // A 30Hz RAF loop advances a `playheadSec` state. EVERY visual decision
  // (which scene shows, which b-roll clip plays, where the playhead sits on
  // the scrubber) is computed from playheadSec on every frame — so the user
  // can drag the scrubber and the picture follows instantly, CapCut-style.
  // TTS for each scene is fired exactly when the playhead crosses its start.
  // ════════════════════════════════════════════════════════════
  const CUT_INTERVAL_SEC = 1.2  // visual cuts within a scene
  const WORDS_PER_SECOND = 2.7  // pacing estimate for fallback timing

  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadSec, setPlayheadSec] = useState(0)
  const [brollByQuery, setBrollByQuery] = useState({})
  // Per-scene edits the user has made via drag: { [sceneId]: { start_sec?, duration_sec? } }
  const [edits, setEdits] = useState({})
  const audioRef = useRef(null)
  const playStartRef = useRef(0)           // wall-clock ms when play began
  const playStartPlayhead = useRef(0)      // playheadSec when play began
  const spokenScenes = useRef(new Set())   // scene ids that already triggered TTS
  // The REAL word index TTS is currently speaking (from onboundary). Reset
  // each time a new scene starts. Falls back to time-based estimate when
  // the browser doesn't emit boundary events.
  const [ttsWordIdx, setTtsWordIdx] = useState(0)

  const voiceId = video?.avatars?.voice_id || ''
  const useBrowserTTS = voiceId.startsWith('browser:')
  const browserVoiceName = useBrowserTTS ? voiceId.slice('browser:'.length) : null

  // Build the scene list from directors_plan. Each scene gets a stable id,
  // an estimated duration (from Director's duration_sec or word count), and
  // a START offset that's the running sum of the previous durations + any
  // user edit. Returns scenes with absolute start_sec/end_sec.
  const scenes = React.useMemo(() => {
    if (!video) return []
    const plan = video.directors_plan || {}
    const raw = []
    if (plan.hook?.text) {
      raw.push({
        id: 'hook',
        kind: 'avatar',
        text: plan.hook.text,
        broll_query: null,
        emphasis: [],
        overlay: null,
        animation: plan.hook.animation,
        base_duration: Number(plan.hook.duration_sec) || 4,
      })
    }
    ;(plan.sections || []).forEach((s, i) => {
      const wc = String(s.text || '').trim().split(/\s+/).length || 1
      const base = Number(s.duration_sec) || Math.max(4, wc / WORDS_PER_SECOND + 0.5)
      raw.push({
        id: `s${i}`,
        kind: 'broll',
        text: s.text || '',
        broll_query: s.b_roll?.query || s.b_roll_query || null,
        emphasis: s.emphasis_words || [],
        overlay: (s.overlay_graphics || []).join(' · ') || null,
        animation: s.animation,
        base_duration: base,
      })
    })
    if (plan.cta?.text) {
      raw.push({
        id: 'cta',
        kind: 'avatar',
        text: plan.cta.text,
        broll_query: null,
        emphasis: [],
        overlay: null,
        animation: plan.cta.animation,
        base_duration: Number(plan.cta.duration_sec) || 4,
      })
    }
    // Fallback: split script into 3 chunks if no plan
    if (raw.length === 0 && video.script) {
      const chunks = video.script.match(/[^.!?]+[.!?]+/g) || [video.script]
      const groupSize = Math.ceil(chunks.length / 3)
      for (let i = 0; i < chunks.length; i += groupSize) {
        const text = chunks.slice(i, i + groupSize).join(' ').trim()
        const wc = text.trim().split(/\s+/).length || 1
        raw.push({
          id: `f${i}`,
          kind: i === 0 ? 'avatar' : 'broll',
          text, broll_query: video.topic, emphasis: [],
          overlay: null, base_duration: wc / WORDS_PER_SECOND + 0.5,
        })
      }
    }

    // Apply user edits + compute absolute start/end
    let cursor = 0
    return raw.map((s) => {
      const e = edits[s.id] || {}
      const duration_sec = Math.max(1.2, e.duration_sec ?? s.base_duration)
      const start_sec = e.start_sec ?? cursor
      const end_sec = start_sec + duration_sec
      cursor = end_sec
      return { ...s, start_sec, duration_sec, end_sec }
    })
  }, [video, edits])

  const totalDuration = scenes.length ? scenes[scenes.length - 1].end_sec : 0

  // Pre-fetch b-roll clips for all scenes that need them. Cached by query.
  // We fetch MANY clips per query (5 each) so the player can cut rapidly
  // between them without running out.
  const ensureBroll = useCallback(async (query) => {
    if (!query) return null
    if (brollByQuery[query]) return brollByQuery[query]
    try {
      const res = await fetch(`${API_URL}/fetch-broll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count: 5, orientation: 'portrait' }),
      })
      const data = await res.json()
      const clips = data.clips || []
      setBrollByQuery((m) => ({ ...m, [query]: clips }))
      return clips
    } catch (err) {
      console.error('b-roll fetch failed:', err)
      return []
    }
  }, [brollByQuery])

  // For extra visual variety, also pre-fetch clips for related terms drawn
  // from the section's emphasis words. The player can borrow these clips
  // mid-scene to keep things moving even when one query gets exhausted.
  const ensureBrollExtras = useCallback(async (scene) => {
    const extras = (scene.emphasis || []).slice(0, 2)
    for (const w of extras) {
      if (!brollByQuery[w]) {
        try {
          const res = await fetch(`${API_URL}/fetch-broll`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: w, count: 3, orientation: 'portrait' }),
          })
          const data = await res.json()
          setBrollByQuery((m) => ({ ...m, [w]: data.clips || [] }))
        } catch {/* ignore */}
      }
    }
  }, [brollByQuery])

  // Stop everything when the modal closes
  useEffect(() => {
    if (!isOpen) {
      try { window.speechSynthesis?.cancel() } catch {/* ignore */}
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
      setIsPlaying(false)
      setPlayheadSec(0)
      spokenScenes.current.clear()
    }
  }, [isOpen])

  // RAF loop: advance playhead during playback, stop at totalDuration
  useEffect(() => {
    if (!isPlaying) return
    let rafId
    const tick = () => {
      const elapsed = (performance.now() - playStartRef.current) / 1000
      const ph = playStartPlayhead.current + elapsed
      if (ph >= totalDuration) {
        setPlayheadSec(totalDuration)
        setIsPlaying(false)
        try { window.speechSynthesis?.cancel() } catch {/* */}
        return
      }
      setPlayheadSec(ph)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, totalDuration])

  // === Derived state from playhead — recomputed every frame ===
  const currentSceneIdx = scenes.findIndex((s) => playheadSec >= s.start_sec && playheadSec < s.end_sec)
  const scene = scenes[currentSceneIdx >= 0 ? currentSceneIdx : 0] || null
  const sceneIndex = currentSceneIdx >= 0 ? currentSceneIdx : 0
  const sceneTime = scene ? (playheadSec - scene.start_sec) : 0
  const sceneBrollClips = scene?.broll_query ? (brollByQuery[scene.broll_query] || []) : []
  // Visual cut every CUT_INTERVAL_SEC within a scene → which clip is on screen
  const clipCycle = sceneBrollClips.length
    ? Math.floor(sceneTime / CUT_INTERVAL_SEC) % sceneBrollClips.length
    : 0
  const sceneBrollClip = sceneBrollClips[clipCycle] || null
  // Word highlight: prefer the real TTS boundary index; fall back to a
  // time-based estimate if the browser doesn't fire boundary events.
  const sceneWordCount = scene ? (scene.text || '').trim().split(/\s+/).length : 0
  const timeEstimateWord = scene
    ? Math.min(sceneWordCount, Math.floor((sceneTime / scene.duration_sec) * sceneWordCount))
    : 0
  const currentWord = ttsWordIdx > 0 ? ttsWordIdx : timeEstimateWord

  // Chunk the current scene's text into 3-4 word phrases. Only the chunk
  // containing the active word is shown on screen — never a whole sentence.
  const sceneChunks = React.useMemo(() => chunkText(scene?.text || ''), [scene?.id, scene?.text])
  // Map currentWord → which chunk + word offset within chunk
  const { activeChunkIdx, wordInChunk } = React.useMemo(() => {
    let consumed = 0
    for (let i = 0; i < sceneChunks.length; i++) {
      const len = sceneChunks[i].split(/\s+/).length
      if (currentWord <= consumed + len) {
        return { activeChunkIdx: i, wordInChunk: Math.max(0, currentWord - consumed - 1) }
      }
      consumed += len
    }
    return { activeChunkIdx: Math.max(0, sceneChunks.length - 1), wordInChunk: 0 }
  }, [sceneChunks, currentWord])
  const activeChunkText = sceneChunks[activeChunkIdx] || ''

  // Pick the caption style for this avatar (deterministic by id, so consistent)
  const captionPreset = React.useMemo(
    () => pickCaptionPreset(video?.avatars?.id || video?.avatar_id, video?.avatars?.niche),
    [video?.avatars?.id, video?.avatar_id, video?.avatars?.niche],
  )

  // Whenever playhead crosses into a new scene, speak its text. We use a
  // ref-set to ensure we only fire TTS once per scene per play-through.
  useEffect(() => {
    if (!isPlaying || !scene) return
    if (spokenScenes.current.has(scene.id)) return
    spokenScenes.current.add(scene.id)
    // SFX on scene boundary
    if (sceneIndex === 0) sfx.thump()
    else if (scene.kind === 'avatar') sfx.ding()
    else sfx.whoosh()
    // Reset boundary index so the new scene's word highlight starts at 0
    setTtsWordIdx(0)
    // Speak the text
    const text = scene.text || ''
    if (useBrowserTTS && 'speechSynthesis' in window && text) {
      const utter = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const match = voices.find((v) => v.name === browserVoiceName)
              || voices.find((v) => v.name.toLowerCase().includes((browserVoiceName || '').toLowerCase()))
              || voices.find((v) => v.lang?.startsWith((video?.render_options?.language || 'en').toLowerCase().slice(0, 2)))
              || null
      if (match) utter.voice = match
      // Match TTS rate to scene duration so words finish around the visual end
      const naturalDur = (text.trim().split(/\s+/).length || 1) / WORDS_PER_SECOND
      utter.rate = Math.max(0.6, Math.min(1.6, naturalDur / scene.duration_sec))
      // The boundary event is what makes the yellow highlight TRACK the real
      // speech instead of being a time-based estimate. Chrome/Edge support
      // it reliably; Firefox doesn't always — the time estimate is the
      // fallback (handled in currentWord above).
      utter.onboundary = (ev) => {
        if (ev.name !== 'word' && ev.name !== undefined) return
        const upto = text.slice(0, ev.charIndex).trim()
        const idx = upto ? upto.split(/\s+/).length : 0
        setTtsWordIdx(idx + 1)
      }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    }
  }, [scene?.id, isPlaying, useBrowserTTS, browserVoiceName, video, sceneIndex])

  // SFX pop on visual cut within a scene
  const prevClipCycle = useRef(0)
  useEffect(() => {
    if (!isPlaying) return
    if (clipCycle !== prevClipCycle.current) {
      sfx.tick()
      prevClipCycle.current = clipCycle
    }
  }, [clipCycle, isPlaying])

  const seekTo = useCallback((sec) => {
    const clamped = Math.max(0, Math.min(totalDuration, sec))
    setPlayheadSec(clamped)
    playStartRef.current = performance.now()
    playStartPlayhead.current = clamped
    // Reset speech state — scenes "before" us are considered already spoken;
    // the current scene will re-trigger via the scene useEffect
    try { window.speechSynthesis?.cancel() } catch {/* */}
    spokenScenes.current = new Set(
      scenes.filter((s) => s.end_sec <= clamped).map((s) => s.id),
    )
  }, [scenes, totalDuration])

  const playVideo = useCallback(async () => {
    if (isPlaying) {
      try { window.speechSynthesis?.cancel() } catch {/* */}
      setIsPlaying(false)
      return
    }
    if (scenes.length === 0) return
    try { window.speechSynthesis?.getVoices() } catch {/* */}
    // Pre-fetch ALL b-roll in parallel so cuts can happen instantly
    await Promise.all(scenes.filter((s) => s.broll_query).map((s) => ensureBroll(s.broll_query)))
    // If we're at the end, restart from 0
    const startAt = playheadSec >= totalDuration ? 0 : playheadSec
    playStartRef.current = performance.now()
    playStartPlayhead.current = startAt
    spokenScenes.current = new Set(
      scenes.filter((s) => s.end_sec <= startAt).map((s) => s.id),
    )
    setPlayheadSec(startAt)
    setIsPlaying(true)
  }, [isPlaying, scenes, ensureBroll, playheadSec, totalDuration])

  // Director's chosen styles for this video
  const sceneAnimation = SCENE_ANIMATIONS[
    scene?.animation || video?.directors_plan?.hook?.animation || 'default'
  ] || SCENE_ANIMATIONS.default
  const captionClass = CAPTION_STYLES[
    video?.directors_plan?.hook?.captions_style || 'highlighted_word_yellow'
  ] || 'cap-yellow'

  useEffect(() => {
    if (video?.script) setEditedScript(video.script)
  }, [video?.script])

  const publishMutation = usePublishVideo()
  const discardMutation = useDiscardVideo()

  if (!isOpen) return null

  const isProcessing = video?.status === 'processing' || video?.status === 'queued' || !video?.script
  const isFailed = video?.status === 'failed'
  const isReady = video?.status === 'ready_for_review' || video?.status === 'ready'
  const isPosted = video?.status === 'posted'

  const togglePlatform = (id) => {
    setSelectedPlatforms((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id]
    )
  }

  const handlePublish = async () => {
    if (selectedPlatforms.length === 0) return
    try {
      await publishMutation.mutateAsync({ video_id: videoId, platforms: selectedPlatforms })
      onClose()
    } catch (err) {
      console.error('Publish failed:', err)
    }
  }

  const handleDiscard = async () => {
    if (!confirm('Discard this video? You can always produce another.')) return
    try {
      await discardMutation.mutateAsync({ video_id: videoId })
      onClose()
    } catch (err) {
      console.error('Discard failed:', err)
    }
  }

  const handleSaveScript = async () => {
    await supabase
      .from('videos')
      .update({ script: editedScript, updated_at: new Date().toISOString() })
      .eq('id', videoId)
    refetch()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-xl)',
          animation: 'bcFadeUp 280ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text)' }}>
              🎬 Video preview
            </h2>
            {video?.avatars?.name && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                by {video.avatars.name} · {video.avatars.niche}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 24,
            cursor: 'pointer', color: 'var(--text-muted)', padding: 0,
          }}>×</button>
        </div>

        {/* === Body === */}
        <div style={{ padding: '24px 28px' }}>
          {isLoading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading...
            </div>
          )}

          {isProcessing && !isLoading && (
            <div style={{
              padding: 40, textAlign: 'center',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border)',
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎨</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                AI is crafting your video...
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Writing script · generating audio · painting thumbnail
              </div>
              <div style={{
                marginTop: 16,
                width: 40, height: 40, margin: '16px auto 0',
                border: '3px solid var(--border)',
                borderTopColor: 'var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          )}

          {isFailed && (
            <div style={{
              padding: 20,
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 13,
            }}>
              ❌ Generation failed
              {video.error_message && <div style={{ marginTop: 6, fontSize: 11 }}>{video.error_message}</div>}
            </div>
          )}

          {(isReady || isPosted) && video && (
            <>
            {/* === Director's Plan summary === */}
            {video.directors_plan && Object.keys(video.directors_plan).length > 0 && (
              <DirectorPlanCard plan={video.directors_plan} viralScore={video.viral_score} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px' }}>
              {/* === Left: Player (avatar shots intercut with b-roll, viral captions) === */}
              <div>
                <style>{`
                  /* Subtle Ken Burns: very slow, very small movement so the
                     subject behind the captions never moves enough to distract. */
                  @keyframes kenBurnsZoom {
                    0%   { transform: scale(1.0); }
                    100% { transform: scale(1.04); }
                  }
                  /* All scene-entry animations are now a clean 380ms crossfade.
                     Different "moves" just nudge the start slightly. */
                  @keyframes sceneFade {
                    0%   { opacity: 0; }
                    100% { opacity: 1; }
                  }
                  @keyframes sceneFadeZoom {
                    0%   { opacity: 0; transform: scale(1.04); }
                    100% { opacity: 1; transform: scale(1.00); }
                  }
                  @keyframes sceneFadeSlide {
                    0%   { opacity: 0; transform: translateX(2%); }
                    100% { opacity: 1; transform: translateX(0); }
                  }
                  /* Captions: gentle drop-in, no scale overshoot. */
                  @keyframes captionDrop {
                    0%   { opacity: 0; transform: translateY(8px); }
                    100% { opacity: 1; transform: translateY(0); }
                  }
                  @keyframes overlaySlide {
                    0%   { opacity: 0; transform: translateY(10px); }
                    100% { opacity: 1; transform: translateY(0); }
                  }
                  /* Active word: subtle highlight only, no bounce */
                  .vp-cap-word {
                    display: inline-block;
                    margin: 0 3px;
                    transition: color 140ms, background-color 140ms;
                  }
                  .cap-yellow .vp-cap-word.active {
                    background: #FBBF24; color: #000;
                    padding: 2px 6px; border-radius: 5px;
                  }
                  .cap-bouncy .vp-cap-word.active,
                  .cap-bold-outline .vp-cap-word.active,
                  .cap-gradient .vp-cap-word.active {
                    color: #FBBF24;
                  }
                  .vp-scene-layer {
                    position: absolute; inset: 0;
                    background-size: cover; background-position: center;
                  }
                `}</style>
                <div
                  onClick={playVideo}
                  style={{
                    width: '100%',
                    aspectRatio: '9/16',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    background: '#000',
                    border: '1px solid var(--border)',
                    position: 'relative',
                    marginBottom: 12,
                    cursor: 'pointer',
                  }}
                >
                  {/* === LAYER 1: avatar portrait (shown when scene.kind === 'avatar') === */}
                  {isPlaying && scene?.kind === 'avatar' && video.avatars?.image_url && (
                    <div
                      key={`avatar-${sceneIndex}`}
                      className="vp-scene-layer"
                      style={{
                        backgroundImage: `url(${proxyImage(video.avatars.image_url)})`,
                        animation: `${sceneAnimation} 380ms ease-out, kenBurnsZoom 14s ease-in-out infinite alternate`,
                      }}
                    />
                  )}

                  {/* === LAYER 1b: b-roll Pexels video — cycles through clips === */}
                  {isPlaying && scene?.kind === 'broll' && sceneBrollClip && (
                    <video
                      key={`broll-${sceneIndex}-${clipCycle}-${sceneBrollClip.url}`}
                      src={sceneBrollClip.url}
                      autoPlay muted loop playsInline
                      style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%',
                        objectFit: 'cover',
                        animation: `${sceneAnimation} 380ms ease-out`,
                      }}
                    />
                  )}
                  {/* Fallback to avatar image if b-roll missing */}
                  {isPlaying && scene?.kind === 'broll' && !sceneBrollClip && video.avatars?.image_url && (
                    <div
                      className="vp-scene-layer"
                      style={{
                        backgroundImage: `url(${proxyImage(video.avatars.image_url)})`,
                        animation: `${sceneAnimation} 380ms ease-out, kenBurnsZoom 14s ease-in-out infinite alternate`,
                        filter: 'brightness(0.85)',
                      }}
                    />
                  )}

                  {/* Dark vignette so captions pop over busy b-roll */}
                  {isPlaying && (
                    <div style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%)',
                    }} />
                  )}

                  {/* === IDLE state: show thumbnail === */}
                  {!isPlaying && video.thumbnail_url && (
                    <div
                      style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `url(${proxyImage(video.thumbnail_url)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  )}

                  {/* === LAYER 2: viral chunked captions (3-4 words at a time) === */}
                  {isPlaying && activeChunkText && (
                    <CaptionLine
                      key={`chunk-${sceneIndex}-${activeChunkIdx}`}
                      text={activeChunkText}
                      activeWord={wordInChunk}
                      preset={captionPreset}
                    />
                  )}
                  {/* Optional overlay graphic (Director's "stat:24%" etc.) */}
                  {isPlaying && scene?.overlay && (
                    <div style={{
                      position: 'absolute', left: 0, right: 0, top: '14%',
                      textAlign: 'center', padding: '0 16px', pointerEvents: 'none',
                    }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '5px 12px',
                        background: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
                        color: '#fff', fontSize: 12, fontWeight: 800,
                        borderRadius: 999, letterSpacing: 0.5,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                        animation: 'overlaySlide 380ms ease-out',
                      }}>
                        {scene.overlay}
                      </div>
                    </div>
                  )}

                  {/* === LAYER 3: hook text (only on first scene) === */}
                  {isPlaying && sceneIndex === 0 && (video.directors_plan?.title || video.topic) && (
                    <div style={{
                      position: 'absolute', left: 0, right: 0, top: '7%',
                      textAlign: 'center', padding: '0 16px',
                      pointerEvents: 'none',
                    }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '7px 16px',
                        background: 'rgba(251,191,36,0.95)',
                        color: '#000', fontSize: 14, fontWeight: 900,
                        letterSpacing: 1.2, textTransform: 'uppercase',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
                        borderRadius: 5,
                        animation: 'sceneFade 380ms ease-out',
                      }}>
                        🎬 {video.directors_plan?.title || video.topic}
                      </div>
                    </div>
                  )}

                  {/* === LAYER 4: scene counter (top-right) === */}
                  {isPlaying && scenes.length > 1 && (
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                      padding: '3px 9px',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      borderRadius: 999,
                      pointerEvents: 'none',
                    }}>
                      {sceneIndex + 1} / {scenes.length}
                    </div>
                  )}

                  {/* === Play / Pause overlay (idle state) === */}
                  {!isPlaying && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.25)',
                    }}>
                      <div style={{
                        width: 72, height: 72,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.95)',
                        color: '#000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 32,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                      }}>
                        ▶
                      </div>
                    </div>
                  )}

                  {!video.thumbnail_url && !isPlaying && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-muted)', fontSize: 12,
                    }}>
                      Loading thumbnail...
                    </div>
                  )}
                </div>

                {/* Play / Stop button + time readout */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={playVideo}
                    disabled={!video.script}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: isPlaying ? 'var(--danger-bg)' : 'var(--brand-gradient)',
                      color: isPlaying ? 'var(--danger)' : '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: video.script ? 'pointer' : 'not-allowed',
                      opacity: video.script ? 1 : 0.5,
                      boxShadow: isPlaying ? 'none' : 'var(--shadow-glow)',
                    }}
                  >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <div style={{
                    padding: '8px 10px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12, fontWeight: 700,
                    background: 'var(--surface-2)', color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    minWidth: 72, textAlign: 'center',
                  }}>
                    {playheadSec.toFixed(1)}s / {totalDuration.toFixed(1)}s
                  </div>
                </div>

                {/* === TIMELINE / SCRUBBER === */}
                {scenes.length > 0 && (
                  <Timeline
                    scenes={scenes}
                    playheadSec={playheadSec}
                    totalDuration={totalDuration}
                    onSeek={seekTo}
                    onEditScene={(id, patch) => setEdits((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }))}
                    onSave={async () => {
                      // Persist scene edits to directors_plan.sections + hook/cta durations
                      const plan = { ...(video.directors_plan || {}) }
                      const newSections = (plan.sections || []).map((s, i) => {
                        const sceneId = `s${i}`
                        const e = edits[sceneId]; if (!e) return s
                        return { ...s, duration_sec: e.duration_sec ?? s.duration_sec }
                      })
                      if (edits.hook?.duration_sec && plan.hook) plan.hook.duration_sec = edits.hook.duration_sec
                      if (edits.cta?.duration_sec && plan.cta)   plan.cta.duration_sec  = edits.cta.duration_sec
                      plan.sections = newSections
                      await supabase.from('videos').update({ directors_plan: plan, updated_at: new Date().toISOString() }).eq('id', videoId)
                      setEdits({})
                      refetch()
                    }}
                    dirty={Object.keys(edits).length > 0}
                  />
                )}
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 4 }}>
                  {useBrowserTTS
                    ? `Voice: ${browserVoiceName} (browser)`
                    : video.audio_url
                    ? 'Streaming audio from Pollinations TTS'
                    : 'No audio configured'}
                </div>

                {/* Hidden HTML5 audio element for non-browser voices */}
                {video.audio_url && !useBrowserTTS && (
                  <audio
                    ref={audioRef}
                    src={video.audio_url}
                    onEnded={() => setIsPlaying(false)}
                    onPause={() => setIsPlaying(false)}
                    style={{ display: 'none' }}
                    preload="none"
                  />
                )}

                {/* Status badge */}
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    background: isPosted ? 'var(--success-bg)' : 'var(--info-bg)',
                    color: isPosted ? 'var(--success)' : 'var(--info)',
                    borderRadius: 999,
                    border: `1px solid ${isPosted ? 'rgba(16,185,129,0.3)' : 'rgba(6,182,212,0.3)'}`,
                  }}>
                    {isPosted ? `● Posted to ${(video.published_platforms || []).join(', ')}` : '● Ready for review'}
                  </span>
                </div>
              </div>

              {/* === Right: Script + Caption + Actions === */}
              <div>
                {/* Topic */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    Topic
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {video.topic}
                  </div>
                </div>

                {/* Scenes editor — edit per-section text + swap b-roll */}
                {!isPosted && scenes.length > 0 && (
                  <ScenesEditor
                    video={video}
                    scenes={scenes}
                    onSave={async (newSections, newScript) => {
                      const newPlan = { ...(video.directors_plan || {}), sections: newSections }
                      await supabase
                        .from('videos')
                        .update({
                          directors_plan: newPlan,
                          script: newScript,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', videoId)
                      setEditedScript(newScript)
                      refetch()
                    }}
                    onSwapBroll={(sceneIdx) => {
                      const s = scenes[sceneIdx]
                      if (!s?.broll_query) return
                      const clips = brollByQuery[s.broll_query] || []
                      // cycle to next clip in our cache, or refetch with a fresh count
                      if (clips.length >= 2) {
                        setClipCycle((c) => (c + 1) % clips.length)
                      } else {
                        ensureBroll(s.broll_query + ' alt')
                      }
                    }}
                  />
                )}

                {/* Script (full text, kept for posted videos) */}
                <div style={{ marginBottom: 16, display: isPosted ? 'block' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Script {!isPosted && '(editable)'}
                    </div>
                    {!isPosted && editedScript !== video.script && (
                      <button
                        onClick={handleSaveScript}
                        style={{
                          padding: '4px 10px',
                          fontSize: 10,
                          background: 'var(--success-bg)',
                          color: 'var(--success)',
                          border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        💾 Save changes
                      </button>
                    )}
                  </div>
                  <textarea
                    value={editedScript}
                    onChange={(e) => setEditedScript(e.target.value)}
                    disabled={isPosted}
                    rows={8}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'var(--surface-2)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 13,
                      lineHeight: 1.6,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>

                {/* Caption */}
                {video.render_options?.caption && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      Caption (social media)
                    </div>
                    <div style={{
                      padding: 10,
                      background: 'var(--surface-2)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      color: 'var(--text)',
                      lineHeight: 1.5,
                    }}>
                      {video.render_options.caption}
                    </div>
                  </div>
                )}

                {/* === Actions === */}
                {!isPosted && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    {/* Platform selector */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Publish to
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {PLATFORMS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePlatform(p.id)}
                            style={{
                              flex: 1,
                              padding: '8px',
                              background: selectedPlatforms.includes(p.id) ? 'var(--primary-glow)' : 'var(--surface-2)',
                              color: selectedPlatforms.includes(p.id) ? 'var(--primary)' : 'var(--text-muted)',
                              border: `1px solid ${selectedPlatforms.includes(p.id) ? 'var(--primary)' : 'var(--border)'}`,
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {p.icon} {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={handleDiscard}
                        disabled={publishMutation.isPending || discardMutation.isPending}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: 'var(--danger-bg)',
                          color: 'var(--danger)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 'var(--radius-md)',
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        🗑️ Discard
                      </button>
                      <button
                        onClick={handlePublish}
                        disabled={publishMutation.isPending || discardMutation.isPending || selectedPlatforms.length === 0}
                        style={{
                          flex: 2,
                          padding: '12px',
                          background: 'var(--brand-gradient)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 'var(--radius-md)',
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                          boxShadow: 'var(--shadow-glow)',
                          opacity: selectedPlatforms.length === 0 ? 0.5 : 1,
                        }}
                      >
                        {publishMutation.isPending ? '...' : `🚀 Publish to ${selectedPlatforms.length} platform${selectedPlatforms.length > 1 ? 's' : ''}`}
                      </button>
                    </div>

                    {(publishMutation.error || discardMutation.error) && (
                      <div style={{
                        marginTop: 10, padding: '8px 12px',
                        background: 'var(--danger-bg)', color: 'var(--danger)',
                        borderRadius: 'var(--radius-sm)', fontSize: 11,
                      }}>
                        ❌ {(publishMutation.error || discardMutation.error).message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Director's Plan visual summary
// ─────────────────────────────────────────────────────────────
const DirectorPlanCard = ({ plan, viralScore }) => {
  const sections = plan.sections || []
  const hook = plan.hook || {}
  const cta = plan.cta || {}
  const music = plan.music || {}
  const thumbnail = plan.thumbnail || {}

  const allSegments = [
    { ...hook, kind: 'hook', label: '🎯 Hook', color: '#F59E0B' },
    ...sections.map((s) => ({ ...s, kind: s.type || 'section', label: `📍 ${s.type || 'section'}`, color: '#7C3AED' })),
    { ...cta, kind: 'cta', label: '🎬 CTA', color: '#06B6D4' },
  ].filter((s) => s.duration_sec)

  const totalDuration = allSegments.reduce((sum, s) => sum + (s.duration_sec || 0), 0)

  return (
    <div style={{
      marginBottom: 20,
      padding: 16,
      background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(6,182,212,0.06))',
      border: '1px solid var(--primary-glow)',
      borderRadius: 'var(--radius-md)',
    }}>
      {/* Header with viral score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', letterSpacing: 1, marginBottom: 4 }}>
            🎬 AI DIRECTOR'S PLAN
          </div>
          {plan.concept && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
              "{plan.concept}"
            </p>
          )}
        </div>
        {typeof viralScore === 'number' && (
          <ViralScoreBadge score={viralScore} />
        )}
      </div>

      {/* Timeline visualization */}
      {allSegments.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 600 }}>
            ⏱️ TIMELINE ({totalDuration}s total)
          </div>
          <div style={{ display: 'flex', gap: 2, height: 28, borderRadius: 6, overflow: 'hidden' }}>
            {allSegments.map((s, i) => {
              const widthPct = (s.duration_sec / totalDuration) * 100
              return (
                <div
                  key={i}
                  title={`${s.label} (${s.duration_sec}s) — ${s.text || ''}`}
                  style={{
                    width: `${widthPct}%`,
                    background: s.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'help',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {widthPct > 8 ? `${s.duration_sec}s` : ''}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
            {allSegments.map((s, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grid of decisions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        {hook.type && (
          <PlanCell label="🎯 Hook" value={hook.type.replace(/_/g, ' ')} sub={hook.animation?.replace(/_/g, ' ')} />
        )}
        {music.search_query && (
          <PlanCell label="🎵 Music" value={music.search_query} sub={`${music.energy} · ${music.volume_db}dB`} />
        )}
        {plan.color_grade && (
          <PlanCell label="🎨 Look" value={plan.color_grade.replace(/_/g, ' ')} sub={plan.transitions?.join(' · ')} />
        )}
        {thumbnail.facial_expression && (
          <PlanCell label="📸 Thumbnail" value={thumbnail.facial_expression} sub={thumbnail.text_overlay} />
        )}
      </div>

      {/* Rationale */}
      {hook.rationale && (
        <div style={{
          marginTop: 10,
          padding: '6px 10px',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 10,
          color: 'var(--text-dim)',
          fontStyle: 'italic',
        }}>
          💡 Why this hook: {hook.rationale}
        </div>
      )}

      {/* Tags */}
      {plan.tags && plan.tags.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {plan.tags.map((tag, i) => (
            <span key={i} style={{
              padding: '2px 8px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 999,
              fontSize: 10,
              color: 'var(--text-muted)',
            }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  )
}

const ViralScoreBadge = ({ score }) => {
  const color = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)'
  const bg = score >= 75 ? 'var(--success-bg)' : score >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)'
  return (
    <div style={{
      padding: '6px 12px',
      background: bg,
      color,
      border: `1px solid ${color}`,
      borderRadius: 'var(--radius-md)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minWidth: 60,
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2, letterSpacing: 0.5 }}>VIRAL</div>
    </div>
  )
}

const PlanCell = ({ label, value, sub }) => (
  <div style={{
    padding: '8px 10px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
  }}>
    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: 0.5 }}>
      {label}
    </div>
    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        {sub}
      </div>
    )}
  </div>
)

// ════════════════════════════════════════════════════════════
// ScenesEditor — compact per-section text editor + b-roll swap
// ════════════════════════════════════════════════════════════
function ScenesEditor({ video, scenes, onSave, onSwapBroll }) {
  // Local editable copy keyed off the plan's sections (skip hook/cta avatar scenes)
  const planSections = video?.directors_plan?.sections || []
  const [edited, setEdited] = React.useState(() => planSections.map((s) => ({ ...s })))
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  React.useEffect(() => {
    setEdited(planSections.map((s) => ({ ...s })))
    setDirty(false)
  }, [video?.id])

  if (planSections.length === 0) return null

  const updateField = (i, field, value) => {
    setEdited((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
    setDirty(true)
  }

  const updateBrollQuery = (i, query) => {
    setEdited((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, b_roll: { ...(r.b_roll || {}), query } } : r))
    )
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Rebuild the spoken script from hook + edited sections + cta
      const hook = video.directors_plan?.hook?.text || ''
      const cta = video.directors_plan?.cta?.text || ''
      const newScript = [hook, ...edited.map((s) => s.text || ''), cta].filter(Boolean).join(' ')
      await onSave(edited, newScript)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  // The b-roll scenes in the player correspond to plan sections, offset by
  // the leading hook scene (which is an 'avatar' scene). So plan section i
  // is player scene (i + 1). We pass that to onSwapBroll.
  const playerSceneIndexFor = (i) => i + (video?.directors_plan?.hook ? 1 : 0)

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          🎬 Scenes ({edited.length})
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '4px 12px',
              fontSize: 10, fontWeight: 700,
              background: 'var(--brand-gradient)', color: '#fff',
              border: 'none', borderRadius: 999,
              cursor: saving ? 'wait' : 'pointer',
              boxShadow: '0 2px 8px rgba(124,58,237,0.4)',
            }}
          >
            {saving ? '⏳ Saving...' : '💾 Save scenes'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {edited.map((s, i) => (
          <div key={i} style={{
            padding: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10,
          }}>
            <div style={{
              width: 24, height: 24,
              borderRadius: 999,
              background: 'var(--brand-gradient)', color: '#fff',
              fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{i + 1}</div>
            <div>
              <textarea
                value={s.text || ''}
                onChange={(e) => updateField(i, 'text', e.target.value)}
                rows={2}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 8px', fontSize: 12,
                  background: 'var(--surface-2)', color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', resize: 'vertical',
                  fontFamily: 'inherit', lineHeight: 1.4,
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>📹 B-roll:</span>
                <input
                  type="text"
                  value={s.b_roll?.query || ''}
                  onChange={(e) => updateBrollQuery(i, e.target.value)}
                  placeholder="search query (English)"
                  style={{
                    flex: 1,
                    padding: '4px 8px', fontSize: 11,
                    background: 'var(--surface-2)', color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => onSwapBroll?.(playerSceneIndexFor(i))}
                  title="Swap to the next available clip for this query"
                  style={{
                    padding: '4px 10px', fontSize: 10, fontWeight: 700,
                    background: 'var(--surface-2)', color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  }}
                >
                  🔄
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Timeline — CapCut-style scrubbable timeline with draggable scene blocks.
//
// Three tracks stacked vertically:
//   🎥 Visual — one block per scene, color-coded by kind (avatar/broll)
//   💬 Captions — same width as scenes, dimmed pill
//   🎵 SFX — marker dots at scene boundaries
//
// Interactions:
//   - Click anywhere on the ruler → seeks playhead
//   - Drag right edge of a visual block → resizes scene duration
//   - "Save edits" button persists durations back to directors_plan
//
// Drag-to-move-the-whole-block is intentionally NOT enabled (yet) because
// it would require recomputing every following scene's start. Resize-only
// keeps the model simple and matches what users actually want most.
// ════════════════════════════════════════════════════════════
function Timeline({ scenes, playheadSec, totalDuration, onSeek, onEditScene, onSave, dirty }) {
  const rulerRef = React.useRef(null)
  const [dragging, setDragging] = React.useState(null) // { sceneId, startX, startDuration }

  const pctOf = (sec) => totalDuration > 0 ? (sec / totalDuration) * 100 : 0

  const handleRulerClick = (e) => {
    if (dragging) return
    const r = rulerRef.current?.getBoundingClientRect()
    if (!r) return
    const x = e.clientX - r.left
    const sec = (x / r.width) * totalDuration
    onSeek(sec)
  }

  // Resize handle: drag the right edge of a scene block to change duration
  const handleResizeStart = (e, scene) => {
    e.stopPropagation()
    e.preventDefault()
    const r = rulerRef.current?.getBoundingClientRect()
    if (!r) return
    setDragging({ sceneId: scene.id, startX: e.clientX, startDuration: scene.duration_sec, pxPerSec: r.width / Math.max(1, totalDuration) })
  }

  React.useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const deltaPx = e.clientX - dragging.startX
      const deltaSec = deltaPx / dragging.pxPerSec
      const newDuration = Math.max(1.2, dragging.startDuration + deltaSec)
      onEditScene(dragging.sceneId, { duration_sec: newDuration })
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, onEditScene])

  const TICKS = 8  // number of vertical tick marks for time reference

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          🎬 Timeline — click to scrub, drag edges to resize
        </div>
        {dirty && (
          <button
            onClick={onSave}
            style={{
              padding: '3px 10px', fontSize: 10, fontWeight: 700,
              background: 'var(--brand-gradient)', color: '#fff',
              border: 'none', borderRadius: 999, cursor: 'pointer',
            }}
          >💾 Save edits</button>
        )}
      </div>

      {/* Time ruler */}
      <div
        ref={rulerRef}
        onClick={handleRulerClick}
        style={{
          position: 'relative',
          height: 16,
          background: 'var(--surface-2)',
          borderRadius: 4,
          cursor: 'pointer',
          marginBottom: 4,
          userSelect: 'none',
        }}
      >
        {[...Array(TICKS + 1)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${(i / TICKS) * 100}%`,
            width: 1, background: 'var(--border)',
          }} />
        ))}
        {[...Array(TICKS + 1)].map((_, i) => (
          <div key={`l-${i}`} style={{
            position: 'absolute', top: 2,
            left: `${(i / TICKS) * 100}%`,
            transform: 'translateX(-50%)',
            fontSize: 8, color: 'var(--text-dim)', fontFamily: 'monospace',
          }}>
            {((i / TICKS) * totalDuration).toFixed(0)}s
          </div>
        ))}
      </div>

      {/* Track 1 — Visual scenes */}
      <Track icon="🎥" label="Visual">
        {scenes.map((s) => {
          const left = pctOf(s.start_sec)
          const width = pctOf(s.duration_sec)
          return (
            <div
              key={s.id}
              title={`${s.kind} · ${s.duration_sec.toFixed(1)}s\n${s.text?.slice(0, 60) || ''}`}
              style={{
                position: 'absolute',
                left: `${left}%`, width: `calc(${width}% - 2px)`,
                top: 2, bottom: 2,
                background: s.kind === 'avatar'
                  ? 'linear-gradient(135deg, #7C3AED, #A78BFA)'
                  : 'linear-gradient(135deg, #06B6D4, #38BDF8)',
                borderRadius: 3,
                display: 'flex', alignItems: 'center',
                padding: '0 6px',
                fontSize: 9, fontWeight: 700, color: '#fff',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              {s.kind === 'avatar' ? '👤' : '🎞️'} {s.text?.slice(0, 32) || s.kind}
              {/* Resize handle */}
              <div
                onMouseDown={(e) => handleResizeStart(e, s)}
                style={{
                  position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                  cursor: 'ew-resize',
                  background: 'rgba(255,255,255,0.3)',
                  borderRadius: '0 3px 3px 0',
                }}
              />
            </div>
          )
        })}
      </Track>

      {/* Track 2 — Captions */}
      <Track icon="💬" label="Captions">
        {scenes.map((s) => (
          <div key={s.id} style={{
            position: 'absolute',
            left: `${pctOf(s.start_sec)}%`,
            width: `calc(${pctOf(s.duration_sec)}% - 2px)`,
            top: 3, bottom: 3,
            background: 'rgba(251, 191, 36, 0.25)',
            border: '1px solid rgba(251, 191, 36, 0.6)',
            borderRadius: 3,
            fontSize: 9, color: '#FBBF24',
            display: 'flex', alignItems: 'center', padding: '0 5px',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {s.text?.slice(0, 24) || ''}
          </div>
        ))}
      </Track>

      {/* Track 3 — SFX */}
      <Track icon="🎵" label="SFX" height={12}>
        {scenes.map((s, i) => (
          <div key={s.id} style={{
            position: 'absolute', left: `${pctOf(s.start_sec)}%`,
            top: '50%', transform: 'translate(-50%, -50%)',
            width: 6, height: 6, borderRadius: '50%',
            background: i === 0 ? '#EF4444' : s.kind === 'avatar' ? '#10B981' : '#06B6D4',
            boxShadow: '0 0 3px currentColor',
          }} title={i === 0 ? 'thump' : s.kind === 'avatar' ? 'ding' : 'whoosh'} />
        ))}
      </Track>

      {/* Playhead line — overlay across the entire stack */}
      <div style={{
        position: 'relative', height: 0,
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute',
          left: `${pctOf(playheadSec)}%`,
          top: -114, height: 114,
          width: 2, background: '#fff',
          boxShadow: '0 0 6px rgba(255,255,255,0.8)',
          transform: 'translateX(-1px)',
        }} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// CaptionLine — renders ONE 3-4 word chunk in the avatar's caption style.
// The active word in the chunk gets the preset's accent treatment.
// ════════════════════════════════════════════════════════════
function CaptionLine({ text, activeWord, preset }) {
  const words = text.split(/\s+/)
  return (
    <div
      style={{
        position: 'absolute', left: 0, right: 0, bottom: '12%',
        padding: '0 22px',
        textAlign: 'center',
        animation: 'captionDrop 280ms ease-out',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        display: 'inline-block',
        fontFamily: preset.font,
        fontSize: preset.size,
        fontWeight: preset.weight,
        fontStyle: preset.italic ? 'italic' : 'normal',
        letterSpacing: preset.letter,
        color: preset.base,
        lineHeight: 1.2,
        textShadow: '3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000, 0 0 14px rgba(0,0,0,0.85)',
        textTransform: preset.font.includes('Anton') || preset.font.includes('Bebas') || preset.font.includes('Black Ops') ? 'uppercase' : 'none',
        maxWidth: '92%',
      }}>
        {words.map((w, i) => {
          const isActive = i === activeWord
          let activeStyle = {}
          if (isActive) {
            if (preset.active === 'gradient' && preset.gradient) {
              activeStyle = {
                backgroundImage: preset.gradient,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
                textShadow: 'none',
                filter: 'drop-shadow(0 0 8px rgba(251,191,36,0.7))',
              }
            } else if (preset.activeBg !== 'transparent') {
              activeStyle = {
                background: preset.activeBg,
                color: preset.active,
                padding: '2px 7px',
                borderRadius: 5,
                ...(preset.rotate ? { display: 'inline-block', transform: `rotate(${preset.rotate}deg)` } : {}),
              }
            } else {
              activeStyle = {
                color: preset.active,
                textShadow: preset.glow ? `${preset.glow}, 3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000` : undefined,
              }
            }
          }
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                margin: '0 4px',
                transition: 'all 120ms ease-out',
                ...activeStyle,
              }}
            >{w}</span>
          )
        })}
      </div>
    </div>
  )
}

function Track({ icon, label, children, height = 18 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, marginBottom: 3 }}>
      <div style={{
        width: 54, fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: 3,
      }}>
        <span>{icon}</span> <span>{label}</span>
      </div>
      <div style={{
        flex: 1, position: 'relative',
        height,
        background: 'rgba(0,0,0,0.15)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

export default VideoPreviewModal
