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

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import { usePublishVideo, useDiscardVideo, proxyImage } from '../BotCraftData'

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

  // Player state: browser SpeechSynthesis when voice_id starts with browser:,
  // otherwise the regular <audio> element wired to audio_url. We track
  // isPlaying ourselves so the play button reflects reality.
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = React.useRef(null)
  const voiceId = video?.avatars?.voice_id || ''
  const useBrowserTTS = voiceId.startsWith('browser:')
  const browserVoiceName = useBrowserTTS ? voiceId.slice('browser:'.length) : null

  // Stop any playback when the modal closes
  useEffect(() => {
    if (!isOpen) {
      try { window.speechSynthesis?.cancel() } catch {/* ignore */}
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
      setIsPlaying(false)
    }
  }, [isOpen])

  const playVideo = () => {
    if (isPlaying) {
      // Stop
      try { window.speechSynthesis?.cancel() } catch {/* */}
      if (audioRef.current) audioRef.current.pause()
      setIsPlaying(false)
      return
    }
    const text = (editedScript || video?.script || '').trim()
    if (!text) return

    if (useBrowserTTS && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text)
      // Try to find the voice the avatar was configured with; fall back to any voice in same lang
      const voices = window.speechSynthesis.getVoices()
      const match = voices.find((v) => v.name === browserVoiceName)
              || voices.find((v) => v.name.toLowerCase().includes((browserVoiceName || '').toLowerCase()))
              || voices.find((v) => v.lang?.startsWith((video?.render_options?.language || 'en').toLowerCase()))
              || null
      if (match) utter.voice = match
      utter.rate = 1.0
      utter.onend = () => setIsPlaying(false)
      utter.onerror = () => setIsPlaying(false)
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
      setIsPlaying(true)
    } else if (audioRef.current) {
      audioRef.current.play().catch((err) => {
        console.error('audio playback failed:', err)
        setIsPlaying(false)
      })
      setIsPlaying(true)
    }
  }

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
              {/* === Left: Player (thumbnail with overlay play button + audio) === */}
              <div>
                <style>{`
                  @keyframes kenBurnsZoom {
                    0%   { transform: scale(1.0)   translate(0,    0); }
                    50%  { transform: scale(1.06)  translate(-1%, -1%); }
                    100% { transform: scale(1.10)  translate(1%,   1%); }
                  }
                `}</style>
                <div
                  onClick={playVideo}
                  style={{
                    width: '100%',
                    aspectRatio: '9/16',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    position: 'relative',
                    marginBottom: 12,
                    cursor: 'pointer',
                  }}
                >
                  {/* The thumbnail image (animated like Ken Burns during playback) */}
                  {video.thumbnail_url && (
                    <div
                      style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `url(${proxyImage(video.thumbnail_url)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        animation: isPlaying ? 'kenBurnsZoom 12s ease-in-out infinite alternate' : 'none',
                        transformOrigin: 'center',
                      }}
                    />
                  )}
                  {/* Caption strip when playing — gives a "watching a video" feel */}
                  {isPlaying && (
                    <div style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0,
                      padding: '14px 16px',
                      background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.85))',
                      color: '#fff', fontSize: 14, fontWeight: 700,
                      lineHeight: 1.35,
                      textShadow: '0 2px 6px rgba(0,0,0,0.7)',
                    }}>
                      {video.directors_plan?.hook?.text || video.topic}
                    </div>
                  )}
                  {/* Big play / pause button overlay */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isPlaying ? 'transparent' : 'rgba(0,0,0,0.25)',
                    transition: 'background 200ms',
                  }}>
                    <div style={{
                      width: 64, height: 64,
                      borderRadius: '50%',
                      background: isPlaying ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.95)',
                      color: isPlaying ? '#fff' : '#000',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 28,
                      boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
                      opacity: isPlaying ? 0.0 : 1.0,
                      transition: 'opacity 200ms, background 200ms',
                    }}>
                      {isPlaying ? '⏸' : '▶'}
                    </div>
                  </div>
                  {!video.thumbnail_url && (
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

                {/* Script */}
                <div style={{ marginBottom: 16 }}>
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

export default VideoPreviewModal
