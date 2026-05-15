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

// Director's animation cue → CSS animation name we drive in the player.
// Falls back to a tasteful default if the Director picks something we
// haven't styled yet.
const SCENE_ANIMATIONS = {
  zoom_punch_in:     'sceneZoomPunch',
  freeze_frame_pop:  'sceneFreezePop',
  whip_pan:          'sceneWhipPan',
  text_explode:      'sceneZoomPunch',
  slow_dolly_in:     'sceneDollyIn',
  slow_pan_right:    'scenePanRight',
  slow_pan_left:     'scenePanLeft',
  hard_cut_montage:  'sceneHardCut',
  logo_pop:          'sceneFreezePop',
  default:           'sceneDollyIn',
}

// Caption styles — Director can pick one per video; we apply the matching class.
const CAPTION_STYLES = {
  highlighted_word_yellow:  'cap-yellow',
  kinetic_bouncing:         'cap-bouncy',
  bold_outline:             'cap-bold-outline',
  gradient_pop:             'cap-gradient',
  none:                     '',
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
        .select('*, avatars(name, image_url, niche, voice_id)')
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
  // Multi-scene player: walks through directors_plan.sections, cutting
  // between the avatar's portrait and b-roll Pexels clips, while
  // SpeechSynthesis reads the line for each section. Kinetic captions
  // highlight the current word as TTS speaks.
  // ════════════════════════════════════════════════════════════
  const [isPlaying, setIsPlaying] = useState(false)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [currentWord, setCurrentWord] = useState(0)         // highlighted word index within scene text
  const [brollByQuery, setBrollByQuery] = useState({})       // cache: query → [{url}]
  const audioRef = useRef(null)
  const stopRequested = useRef(false)

  const voiceId = video?.avatars?.voice_id || ''
  const useBrowserTTS = voiceId.startsWith('browser:')
  const browserVoiceName = useBrowserTTS ? voiceId.slice('browser:'.length) : null

  // Build the scene list from directors_plan (hook + sections + cta). If no
  // plan, fall back to splitting the raw script into ~3 chunks.
  const scenes = React.useMemo(() => {
    if (!video) return []
    const plan = video.directors_plan || {}
    const out = []
    if (plan.hook?.text) {
      out.push({
        kind: 'avatar',                  // hook = show the avatar (consistent face)
        text: plan.hook.text,
        broll_query: null,
        emphasis: [],
      })
    }
    for (const s of (plan.sections || [])) {
      out.push({
        kind: 'broll',                   // body = b-roll cuts
        text: s.text || '',
        broll_query: s.b_roll?.query || s.b_roll_query || null,
        emphasis: s.emphasis_words || [],
        overlay: (s.overlay_graphics || []).join(' · '),
      })
    }
    if (plan.cta?.text) {
      out.push({
        kind: 'avatar',                  // CTA = avatar back on screen
        text: plan.cta.text,
        broll_query: null,
        emphasis: [],
      })
    }
    if (out.length === 0 && video.script) {
      // No director plan — split script into ~3 chunks
      const chunks = video.script.match(/[^.!?]+[.!?]+/g) || [video.script]
      const groupSize = Math.ceil(chunks.length / 3)
      for (let i = 0; i < chunks.length; i += groupSize) {
        const text = chunks.slice(i, i + groupSize).join(' ').trim()
        out.push({ kind: i === 0 ? 'avatar' : 'broll', text, broll_query: video.topic, emphasis: [] })
      }
    }
    return out
  }, [video])

  // Pre-fetch b-roll clips for all scenes that need them. Cached by query.
  const ensureBroll = useCallback(async (query) => {
    if (!query) return null
    if (brollByQuery[query]) return brollByQuery[query]
    try {
      const res = await fetch(`${API_URL}/fetch-broll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count: 2, orientation: 'portrait' }),
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

  // Stop everything when the modal closes
  useEffect(() => {
    if (!isOpen) {
      stopRequested.current = true
      try { window.speechSynthesis?.cancel() } catch {/* ignore */}
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
      setIsPlaying(false)
      setSceneIndex(0)
      setCurrentWord(0)
    }
  }, [isOpen])

  // Track which b-roll clip within the section is currently shown. Long
  // sections cycle through multiple Pexels clips at ~3.5s each so the
  // viewer doesn't see the same loop the whole time.
  const [clipCycle, setClipCycle] = useState(0)

  // Cycle b-roll clips every ~3.5s while a multi-clip scene is on screen.
  // Inlined the scene lookup so this can sit before `scene` is declared below.
  useEffect(() => {
    if (!isPlaying) return
    const s = scenes[sceneIndex]
    if (!s || s.kind !== 'broll') return
    const clips = s.broll_query ? brollByQuery[s.broll_query] : null
    if (!clips || clips.length < 2) return
    setClipCycle(0)
    const id = setInterval(() => setClipCycle((c) => (c + 1) % clips.length), 3500)
    return () => clearInterval(id)
  }, [isPlaying, sceneIndex, scenes, brollByQuery])

  // Speak one scene's text. Returns a promise that resolves when done.
  const speakScene = useCallback((text) => {
    return new Promise((resolve) => {
      if (!text) return resolve()
      if (useBrowserTTS && 'speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(text)
        const voices = window.speechSynthesis.getVoices()
        const match = voices.find((v) => v.name === browserVoiceName)
                || voices.find((v) => v.name.toLowerCase().includes((browserVoiceName || '').toLowerCase()))
                || voices.find((v) => v.lang?.startsWith((video?.render_options?.language || 'en').toLowerCase().slice(0, 2)))
                || null
        if (match) utter.voice = match
        utter.rate = 1.0
        // Word-by-word highlighting via the boundary event
        utter.onboundary = (ev) => {
          if (ev.name === 'word') {
            // Character index → word index
            const upto = text.slice(0, ev.charIndex).trim().split(/\s+/).length
            setCurrentWord(upto)
          }
        }
        utter.onend = () => resolve()
        utter.onerror = () => resolve()
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utter)
      } else if (video?.audio_url && audioRef.current) {
        // External audio: just wait for its 'ended' event (one big audio file
        // for the whole video). Per-scene cuts still happen visually based on
        // an even time split.
        const dur = audioRef.current.duration || 0
        const sceneDur = scenes.length ? dur / scenes.length : 5
        const wordCount = (text || '').trim().split(/\s+/).length || 1
        const interval = (sceneDur * 1000) / wordCount
        let wi = 0
        const id = setInterval(() => {
          wi += 1
          setCurrentWord(wi)
          if (wi >= wordCount) clearInterval(id)
        }, interval)
        if (sceneIndex === 0) audioRef.current.play().catch(() => resolve())
        setTimeout(() => { clearInterval(id); resolve() }, sceneDur * 1000)
      } else {
        // No TTS available — fallback: estimate 2.7 words/sec
        const wordCount = (text || '').trim().split(/\s+/).length || 1
        const ms = (wordCount / 2.7) * 1000
        let wi = 0
        const id = setInterval(() => {
          wi += 1
          setCurrentWord(wi)
          if (wi >= wordCount) clearInterval(id)
        }, ms / wordCount)
        setTimeout(() => { clearInterval(id); resolve() }, ms)
      }
    })
  }, [useBrowserTTS, browserVoiceName, video, scenes.length, sceneIndex])

  const playVideo = useCallback(async () => {
    if (isPlaying) {
      stopRequested.current = true
      try { window.speechSynthesis?.cancel() } catch {/* */}
      if (audioRef.current) audioRef.current.pause()
      setIsPlaying(false)
      return
    }
    if (scenes.length === 0) return

    // Warm up the speech synth voice list (Chrome quirk)
    try { window.speechSynthesis?.getVoices() } catch {/* */}

    // Pre-fetch b-roll for all scenes that need it
    await Promise.all(scenes.filter((s) => s.broll_query).map((s) => ensureBroll(s.broll_query)))

    stopRequested.current = false
    setIsPlaying(true)
    for (let i = 0; i < scenes.length; i++) {
      if (stopRequested.current) break
      setSceneIndex(i)
      setCurrentWord(0)
      await speakScene(scenes[i].text)
    }
    setIsPlaying(false)
    setSceneIndex(0)
    setCurrentWord(0)
  }, [isPlaying, scenes, ensureBroll, speakScene])

  // The currently-on-screen scene
  const scene = scenes[sceneIndex] || null
  const sceneBrollClips = scene?.broll_query ? (brollByQuery[scene.broll_query] || []) : []
  const sceneBrollClip = sceneBrollClips[clipCycle % Math.max(1, sceneBrollClips.length)] || null

  // Trigger SFX on scene change + word boundaries
  useEffect(() => {
    if (!isPlaying || !scene) return
    if (sceneIndex === 0) sfx.thump()        // hook punch-in
    else if (scene.kind === 'avatar') sfx.ding()  // CTA arrival
    else sfx.whoosh()                         // body scene swap
  }, [sceneIndex, isPlaying])

  // Pop on each highlighted word — gives the captions rhythm
  useEffect(() => {
    if (!isPlaying || currentWord === 0) return
    sfx.pop()
  }, [currentWord, isPlaying])

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
                  @keyframes kenBurnsZoom {
                    0%   { transform: scale(1.0)   translate(0,    0); }
                    50%  { transform: scale(1.06)  translate(-1%, -1%); }
                    100% { transform: scale(1.10)  translate(1%,   1%); }
                  }
                  @keyframes sceneZoomPunch {
                    0%   { transform: scale(1.25); opacity: 0; }
                    60%  { transform: scale(0.98); opacity: 1; }
                    100% { transform: scale(1.00); }
                  }
                  @keyframes sceneFreezePop {
                    0%   { transform: scale(0.85) rotate(-2deg); opacity: 0; }
                    100% { transform: scale(1.00) rotate(0);     opacity: 1; }
                  }
                  @keyframes sceneWhipPan {
                    0%   { transform: translateX(50%) skewX(-15deg); opacity: 0; filter: blur(8px); }
                    60%  { transform: translateX(-3%) skewX(2deg);   opacity: 1; filter: blur(0); }
                    100% { transform: translateX(0)   skewX(0);      opacity: 1; }
                  }
                  @keyframes sceneDollyIn {
                    0%   { transform: scale(1.15); opacity: 0; }
                    100% { transform: scale(1.00); opacity: 1; }
                  }
                  @keyframes scenePanRight {
                    0%   { transform: translateX(-6%) scale(1.08); opacity: 0; }
                    100% { transform: translateX(0)   scale(1.08); opacity: 1; }
                  }
                  @keyframes scenePanLeft {
                    0%   { transform: translateX(6%)  scale(1.08); opacity: 0; }
                    100% { transform: translateX(0)   scale(1.08); opacity: 1; }
                  }
                  @keyframes sceneHardCut {
                    0%   { filter: brightness(2.2); }
                    20%  { filter: brightness(1.0); }
                    100% { filter: brightness(1.0); }
                  }
                  @keyframes captionDrop {
                    0%   { transform: translateY(20px) scale(0.9); opacity: 0; }
                    60%  { transform: translateY(-3px) scale(1.04); }
                    100% { transform: translateY(0)    scale(1.0); opacity: 1; }
                  }
                  @keyframes wordPop {
                    0%   { transform: scale(0.7);  }
                    60%  { transform: scale(1.18); }
                    100% { transform: scale(1.00); }
                  }
                  @keyframes overlaySlide {
                    0%   { transform: translateY(60px) rotate(-3deg); opacity: 0; }
                    100% { transform: translateY(0)    rotate(-3deg); opacity: 1; }
                  }
                  @keyframes hookBadgeWiggle {
                    0%, 100% { transform: rotate(-2deg) scale(1.0); }
                    50%      { transform: rotate(-4deg) scale(1.05); }
                  }
                  /* Caption text styling — kinetic by default */
                  .vp-cap-word {
                    display: inline-block;
                    margin: 0 3px;
                    transition: transform 120ms ease-out;
                  }
                  .cap-yellow .vp-cap-word.active {
                    background: #FBBF24; color: #000;
                    padding: 2px 6px; border-radius: 5px;
                    box-shadow: 0 0 14px rgba(251,191,36,0.7), 0 2px 4px rgba(0,0,0,0.5);
                    animation: wordPop 220ms cubic-bezier(0.22,1,0.36,1);
                  }
                  .cap-bouncy .vp-cap-word.active {
                    color: #FBBF24;
                    text-shadow: 3px 3px 0 #000, 0 0 20px rgba(251,191,36,0.8);
                    animation: wordPop 260ms cubic-bezier(0.34,1.56,0.64,1);
                    transform: scale(1.15);
                  }
                  .cap-bold-outline .vp-cap-word.active {
                    color: #fff;
                    -webkit-text-stroke: 2px #FBBF24;
                    text-shadow: 0 0 18px #FBBF24;
                    transform: scale(1.1);
                  }
                  .cap-gradient .vp-cap-word.active {
                    background: linear-gradient(135deg, #FBBF24, #EF4444);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                    transform: scale(1.2);
                    text-shadow: none;
                    filter: drop-shadow(0 0 12px rgba(251,191,36,0.7));
                  }
                  /* Animated b-roll/avatar pan */
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
                        animation: `${sceneAnimation} 700ms cubic-bezier(0.22,1,0.36,1), kenBurnsZoom 8s 700ms ease-in-out infinite alternate`,
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
                        animation: `${sceneAnimation} 700ms cubic-bezier(0.22,1,0.36,1)`,
                      }}
                    />
                  )}
                  {/* Fallback to avatar image if b-roll missing */}
                  {isPlaying && scene?.kind === 'broll' && !sceneBrollClip && video.avatars?.image_url && (
                    <div
                      className="vp-scene-layer"
                      style={{
                        backgroundImage: `url(${proxyImage(video.avatars.image_url)})`,
                        animation: `${sceneAnimation} 700ms cubic-bezier(0.22,1,0.36,1), kenBurnsZoom 8s 700ms ease-in-out infinite alternate`,
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

                  {/* === LAYER 2: viral kinetic captions (word-by-word highlight) === */}
                  {isPlaying && scene && (
                    <div
                      key={`cap-${sceneIndex}`}
                      className={captionClass}
                      style={{
                        position: 'absolute', left: 0, right: 0, bottom: '10%',
                        padding: '0 22px',
                        textAlign: 'center',
                        animation: 'captionDrop 420ms cubic-bezier(0.22,1,0.36,1)',
                        pointerEvents: 'none',
                      }}
                    >
                      <div style={{
                        display: 'inline-block',
                        fontSize: 26, fontWeight: 900,
                        lineHeight: 1.2,
                        color: '#fff',
                        textShadow: '3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000, 0 0 12px rgba(0,0,0,0.8)',
                        letterSpacing: '0.5px',
                        maxWidth: '92%',
                      }}>
                        {scene.text.split(/\s+/).map((w, i) => (
                          <span key={i} className={`vp-cap-word ${i === currentWord ? 'active' : ''}`}>
                            {w}
                          </span>
                        ))}
                      </div>
                      {scene.overlay && (
                        <div style={{
                          marginTop: 12,
                          display: 'inline-block',
                          padding: '6px 14px',
                          background: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
                          color: '#fff', fontSize: 13, fontWeight: 800,
                          borderRadius: 999,
                          letterSpacing: 0.5,
                          textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                          animation: 'overlaySlide 450ms cubic-bezier(0.22,1,0.36,1)',
                          transform: 'rotate(-3deg)',
                        }}>
                          {scene.overlay}
                        </div>
                      )}
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
                        animation: 'hookBadgeWiggle 2.4s ease-in-out infinite',
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

                {/* Play / Stop button + voice label */}
                <button
                  onClick={playVideo}
                  disabled={!video.script}
                  style={{
                    width: '100%',
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
                  {isPlaying ? '⏸ Stop' : '▶ Play video'}
                </button>
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

export default VideoPreviewModal
