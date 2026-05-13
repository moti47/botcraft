/**
 * AvatarDetailModal — clicking an avatar opens this full detail view.
 *
 * Shows:
 *   - Big portrait + name + bio
 *   - All persona attributes (niche, language, tone, music, style, palette)
 *   - Recent videos for this avatar (live from DB)
 *   - Command input to refine in natural language
 *   - Produce-video button (with optional scheduling)
 *   - Pause / resume toggle
 *   - Delete avatar
 */

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import { useProduceVideo, proxyImage } from '../BotCraftData'
import { AvatarCommandInput } from './AvatarCommandInput'
import { VideoPreviewModal } from './VideoPreviewModal'
import { VoicePicker } from './VoicePicker'

export const AvatarDetailModal = ({ avatar, isOpen, onClose }) => {
  const [tab, setTab] = useState('overview')
  const [videoTopic, setVideoTopic] = useState('')
  const [videoScheduled, setVideoScheduled] = useState('')
  const [videoUserCommand, setVideoUserCommand] = useState('')
  const [previewVideoId, setPreviewVideoId] = useState(null)
  const queryClient = useQueryClient()
  const produceVideo = useProduceVideo()

  // Pull this avatar's videos
  const { data: videos = [] } = useQuery({
    queryKey: ['avatar-videos', avatar?.id],
    queryFn: async () => {
      if (!avatar?.id) return []
      const { data } = await supabase
        .from('videos')
        .select('*')
        .eq('avatar_id', avatar.id)
        .order('created_at', { ascending: false })
        .limit(20)
      return data || []
    },
    enabled: !!avatar?.id && isOpen,
  })

  // Pause / unpause
  const togglePause = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('avatars')
        .update({ is_paused: !avatar.is_paused })
        .eq('id', avatar.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avatars'] }),
  })

  // Delete avatar
  const deleteAvatar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('avatars').delete().eq('id', avatar.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avatars'] })
      onClose()
    },
  })

  const handleProduce = async () => {
    if (!avatar?.id) return
    const scheduled_for = videoScheduled ? new Date(videoScheduled).toISOString() : null
    const result = await produceVideo.mutateAsync({
      avatar_id: avatar.id,
      topic: videoTopic || null,
      scheduled_for,
      user_command: videoUserCommand || null,
    })
    setVideoTopic('')
    setVideoScheduled('')
    setVideoUserCommand('')
    queryClient.invalidateQueries({ queryKey: ['avatar-videos', avatar.id] })
    if (!scheduled_for && result?.video_id) {
      setPreviewVideoId(result.video_id)
    }
  }

  if (!isOpen || !avatar) return null

  const brand = avatar.brand_identity || {}
  const palette = brand.palette || ['#7C3AED', '#06B6D4']

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-xl)',
          animation: 'bcFadeUp 280ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* === HEADER (banner with portrait) === */}
        <div style={{
          padding: '24px 28px',
          background: `linear-gradient(135deg, ${palette[0]}22, ${palette[1] || palette[0]}22)`,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
          position: 'relative',
        }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: 12, right: 14,
            background: 'rgba(255,255,255,0.8)', border: 'none',
            width: 30, height: 30, borderRadius: 999,
            fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)',
          }}>×</button>

          <div style={{
            width: 120, height: 120,
            borderRadius: 'var(--radius-lg)',
            background: `linear-gradient(135deg, ${palette[0]}, ${palette[1] || palette[0]})`,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 40,
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {avatar.image_url ? (
              <PortraitImage src={proxyImage(avatar.image_url)} alt={avatar.name} fallback={(avatar.name?.[0] || '?').toUpperCase()} />
            ) : (avatar.name?.[0] || '?').toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
              {avatar.name}
            </h2>
            {avatar.bio && (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {avatar.bio}
              </p>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill>{avatar.niche}</Pill>
              <Pill>{avatar.language?.toUpperCase()}</Pill>
              {avatar.tone && <Pill>{avatar.tone}</Pill>}
              {avatar.music_genre && <Pill>🎵 {avatar.music_genre}</Pill>}
              {avatar.avatar_style && <Pill>{avatar.avatar_style}</Pill>}
              {avatar.is_paused
                ? <Pill bg="var(--warning-bg)" color="var(--warning)">⏸️ Paused</Pill>
                : <Pill bg="var(--success-bg)" color="var(--success)">● Active</Pill>}
            </div>
          </div>
        </div>

        {/* === TABS === */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 28px' }}>
          {['overview', 'voice', 'videos', 'settings'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '14px 16px',
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
                color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t}
              {t === 'videos' && videos.length > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-dim)' }}>({videos.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* === TAB CONTENT === */}
        <div style={{ padding: '24px 28px' }}>
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Produce video */}
              <section>
                <h3 style={sectionTitle}>🎬 Produce a video</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Topic (optional - AI picks viral trend if blank)"
                    value={videoTopic}
                    onChange={(e) => setVideoTopic(e.target.value)}
                    style={inputStyle}
                  />
                  <textarea
                    placeholder="🎬 Director instructions (optional) — e.g. 'make the hook controversial', 'use a story format', 'emphasize the surprise at second 12'"
                    value={videoUserCommand}
                    onChange={(e) => setVideoUserCommand(e.target.value)}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                  <input
                    type="datetime-local"
                    value={videoScheduled}
                    onChange={(e) => setVideoScheduled(e.target.value)}
                    title="Leave blank to produce immediately"
                    style={inputStyle}
                  />
                  <button
                    onClick={handleProduce}
                    disabled={produceVideo.isPending || avatar.is_paused}
                    style={{
                      padding: '10px',
                      background: 'var(--brand-gradient)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: produceVideo.isPending ? 'wait' : avatar.is_paused ? 'not-allowed' : 'pointer',
                      boxShadow: 'var(--shadow-glow)',
                      opacity: avatar.is_paused ? 0.5 : 1,
                    }}
                  >
                    {avatar.is_paused
                      ? '⏸️ Avatar is paused'
                      : produceVideo.isPending
                      ? '...'
                      : videoScheduled ? '⏰ Schedule' : '🎬 Produce now'}
                  </button>
                </div>
              </section>

              {/* Command input */}
              <section>
                <h3 style={sectionTitle}>💬 Refine with AI</h3>
                <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-dim)' }}>
                  Type things like "make her more witty" or "regenerate portrait"
                </p>
                <AvatarCommandInput avatarId={avatar.id} />
              </section>

              {/* Life Story */}
              {avatar.life_story && (
                <section>
                  <h3 style={sectionTitle}>📖 Life story</h3>
                  <div style={{
                    padding: '14px 16px',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 13,
                    color: 'var(--text)',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-line',
                    border: '1px solid var(--border)',
                  }}>
                    {avatar.life_story}
                  </div>
                </section>
              )}

              {/* Persona details */}
              <section>
                <h3 style={sectionTitle}>👤 Persona</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <DetailRow label="Niche" value={avatar.niche} />
                  <DetailRow label="Content language" value={avatar.language?.toUpperCase()} />
                  <DetailRow label="Tone" value={avatar.tone || '—'} />
                  <DetailRow label="Music genre" value={avatar.music_genre || '—'} />
                  <DetailRow label="Created" value={new Date(avatar.created_at).toLocaleDateString()} />
                </div>
              </section>

              {/* Brand identity */}
              {brand && Object.keys(brand).length > 0 && (
                <section>
                  <h3 style={sectionTitle}>🎨 Brand identity</h3>
                  {brand.palette && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      {brand.palette.map((c, i) => (
                        <div key={i} style={{
                          width: 30, height: 30, borderRadius: 6,
                          background: c,
                          border: '1px solid var(--border)',
                          fontSize: 9,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                        }}>
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                  {brand.voice_traits && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {brand.voice_traits.map((t, i) => <Pill key={i}>{t}</Pill>)}
                    </div>
                  )}
                  {brand.appearance && (
                    <DetailRow label="Appearance" value={brand.appearance} fullWidth />
                  )}
                  {brand.custom_instructions && (
                    <DetailRow label="Custom instructions" value={brand.custom_instructions} fullWidth />
                  )}
                </section>
              )}
            </div>
          )}

          {tab === 'voice' && (
            <div>
              <div style={{ marginBottom: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                🎤 <strong>AI-matched voices</strong> — ranked by how well each ElevenLabs voice fits this avatar's appearance, age, tone, and language. Press ▶ to preview, then Select your favorite. The chosen voice will be used in every video this avatar produces.
              </div>
              <VoicePicker avatar={avatar} />
            </div>
          )}

          {tab === 'videos' && (
            <div>
              {videos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                  No videos yet. Use the Overview tab to produce the first one.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {videos.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPreviewVideoId(v.id)}
                      style={{
                        padding: 12,
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid transparent',
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'left',
                        transition: 'all var(--transition-base)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent' }}
                    >
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        {v.thumbnail_url && (
                          <div style={{
                            width: 40, height: 56,
                            borderRadius: 6,
                            background: `url(${proxyImage(v.thumbnail_url)}) center/cover`,
                            border: '1px solid var(--border)',
                            flexShrink: 0,
                          }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                            {v.topic || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                            {new Date(v.created_at).toLocaleString()}
                            {v.scheduled_for && ` · scheduled ${new Date(v.scheduled_for).toLocaleString()}`}
                          </div>
                        </div>
                      </div>
                      <Pill bg={statusColor(v.status, 'bg')} color={statusColor(v.status, 'fg')}>
                        {v.status}
                      </Pill>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={() => togglePause.mutate()}
                disabled={togglePause.isPending}
                style={{
                  padding: 12,
                  background: avatar.is_paused ? 'var(--success-bg)' : 'var(--warning-bg)',
                  color: avatar.is_paused ? 'var(--success)' : 'var(--warning)',
                  border: `1px solid ${avatar.is_paused ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {avatar.is_paused ? '▶️ Resume avatar' : '⏸️ Pause avatar'}
              </button>

              <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Avatar ID</div>
                <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {avatar.id}
                </code>
              </div>

              <button
                onClick={() => {
                  if (confirm(`Delete "${avatar.name}"? This deletes all its videos too. Cannot be undone.`)) {
                    deleteAvatar.mutate()
                  }
                }}
                disabled={deleteAvatar.isPending}
                style={{
                  padding: 12,
                  background: 'var(--danger-bg)',
                  color: 'var(--danger)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginTop: 8,
                }}
              >
                {deleteAvatar.isPending ? 'Deleting...' : '🗑️ Delete avatar'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Video preview modal — clicking a video opens here */}
      <VideoPreviewModal
        videoId={previewVideoId}
        isOpen={!!previewVideoId}
        onClose={() => setPreviewVideoId(null)}
      />
    </div>
  )
}

// ============================================================
// Image with explicit loading + error states (Pollinations can be slow)
const PortraitImage = ({ src, alt, fallback }) => {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  return (
    <>
      {!loaded && !errored && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 4,
          color: '#fff', fontSize: 10,
        }}>
          <div style={{
            width: 22, height: 22,
            border: '3px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ fontSize: 9, opacity: 0.8 }}>Loading...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
      {errored && fallback}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: loaded ? 'block' : 'none',
        }}
      />
    </>
  )
}

const statusColor = (status, kind) => {
  const map = {
    ready_for_review:  { bg: 'rgba(6,182,212,0.12)', fg: 'var(--accent)' },
    ready:             { bg: 'var(--success-bg)',    fg: 'var(--success)' },
    posted:            { bg: 'var(--success-bg)',    fg: 'var(--success)' },
    processing:        { bg: 'rgba(6,182,212,0.12)', fg: 'var(--accent)' },
    queued:            { bg: 'var(--surface)',       fg: 'var(--text-muted)' },
    failed:            { bg: 'var(--danger-bg)',     fg: 'var(--danger)' },
    discarded:         { bg: 'var(--surface)',       fg: 'var(--text-dim)' },
  }
  return (map[status] || map.queued)[kind]
}

const Pill = ({ children, bg, color }) => (
  <span style={{
    display: 'inline-block',
    padding: '3px 9px',
    fontSize: 10,
    fontWeight: 600,
    background: bg || 'var(--surface-2)',
    color: color || 'var(--text-muted)',
    border: `1px solid ${bg ? 'transparent' : 'var(--border)'}`,
    borderRadius: 999,
    whiteSpace: 'nowrap',
  }}>
    {children}
  </span>
)

const DetailRow = ({ label, value, fullWidth }) => (
  <div style={{
    padding: '8px 10px',
    background: 'var(--surface-2)',
    borderRadius: 'var(--radius-sm)',
    gridColumn: fullWidth ? '1 / -1' : 'auto',
  }}>
    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </div>
    <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 2 }}>
      {value}
    </div>
  </div>
)

const sectionTitle = {
  margin: '0 0 10px',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text)',
}

const inputStyle = {
  padding: '9px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 12,
  background: 'var(--surface-2)',
  color: 'var(--text)',
}

export default AvatarDetailModal
