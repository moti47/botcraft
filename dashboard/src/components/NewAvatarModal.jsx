/**
 * NewAvatarModal — clean two-column avatar creation
 *
 * Left:  Live portrait preview (auto-generates as you type)
 * Right: Two boxes
 *   - 👤 Personal Details (name, bio, custom instructions)
 *   - 🎨 Edit Style (tone, music, color palette)
 *
 * Niche + Language are the only required fields at top.
 * Preview regenerates automatically (debounced) when any field changes.
 */

import React, { useState, useEffect, useRef } from 'react'
import { useCreateAvatar, useAvatarPreview, proxyImage } from '../BotCraftData'

const NICHES = [
  'tech', 'fitness', 'comedy', 'cooking', 'gaming',
  'fashion', 'finance', 'travel', 'beauty', 'education',
  'music', 'sports', 'wellness', 'lifestyle', 'business',
]

const LANGUAGES = [
  { value: 'EN', label: '🇺🇸 English' },
  { value: 'HE', label: '🇮🇱 עברית' },
  { value: 'ES', label: '🇪🇸 Español' },
  { value: 'FR', label: '🇫🇷 Français' },
  { value: 'DE', label: '🇩🇪 Deutsch' },
  { value: 'PT', label: '🇵🇹 Português' },
  { value: 'IT', label: '🇮🇹 Italiano' },
  { value: 'AR', label: '🇸🇦 العربية' },
  { value: 'JA', label: '🇯🇵 日本語' },
  { value: 'ZH', label: '🇨🇳 中文' },
]

const TONES = [
  { value: 'engaging', label: '✨ Engaging' },
  { value: 'witty', label: '😏 Witty' },
  { value: 'formal', label: '🎩 Formal' },
  { value: 'casual', label: '😎 Casual' },
  { value: 'inspirational', label: '🚀 Inspirational' },
]

const MUSIC_GENRES = [
  { value: '', label: '🎲 AI picks' },
  { value: 'lo-fi', label: '🎧 Lo-fi' },
  { value: 'electronic', label: '🎛️ Electronic' },
  { value: 'cinematic', label: '🎬 Cinematic' },
  { value: 'ambient', label: '🌌 Ambient' },
  { value: 'hip-hop', label: '🎤 Hip-hop' },
  { value: 'jazz', label: '🎷 Jazz' },
  { value: 'pop', label: '🎵 Pop' },
]

const PRESET_PALETTES = [
  { name: 'Purple Cyan', colors: ['#7C3AED', '#06B6D4'] },
  { name: 'Sunset', colors: ['#F59E0B', '#EF4444'] },
  { name: 'Ocean', colors: ['#0EA5E9', '#10B981'] },
  { name: 'Berry', colors: ['#DB2777', '#9333EA'] },
  { name: 'Forest', colors: ['#059669', '#84CC16'] },
  { name: 'Mono', colors: ['#1F2937', '#9CA3AF'] },
  { name: 'AI picks', colors: null },
]

export const NewAvatarModal = ({ isOpen, onClose, onSuccess, uiLanguage = 'EN' }) => {
  const [form, setForm] = useState({
    niche: '',
    language: 'EN',
    name: '',
    bio: '',
    tone: 'engaging',
    music_genre: '',
    custom_instructions: '',
    palette: null,  // null = AI picks
  })
  const [preview, setPreview] = useState(null)
  const [imageSeed, setImageSeed] = useState(null)
  const debounceTimer = useRef(null)
  const lastPreviewKey = useRef(null)

  const previewMutation = useAvatarPreview()
  const createMutation = useCreateAvatar()

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e?.target?.value !== undefined ? e.target.value : e }))

  // ── AUTO PREVIEW (debounced)
  // Generates a fresh preview when niche/name/custom_instructions/tone change
  useEffect(() => {
    if (!isOpen || !form.niche.trim() || form.niche.length < 2) return
    const key = JSON.stringify({
      n: form.niche, name: form.name, bio: form.bio,
      tone: form.tone, ci: form.custom_instructions, p: form.palette,
    })
    if (key === lastPreviewKey.current) return

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      lastPreviewKey.current = key
      generatePreview(false)
    }, 800)
    return () => clearTimeout(debounceTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.niche, form.name, form.bio, form.tone, form.custom_instructions, form.palette, isOpen])

  const generatePreview = async (newSeed = false) => {
    if (!form.niche.trim()) return
    const seed = newSeed ? Math.floor(Math.random() * 1_000_000) : (imageSeed ?? Math.floor(Math.random() * 1_000_000))
    if (newSeed || !imageSeed) setImageSeed(seed)

    try {
      const result = await previewMutation.mutateAsync({
        niche: form.niche,
        language: form.language,
        ui_language: uiLanguage,
        name: form.name || null,
        bio: form.bio || null,
        tone: form.tone,
        avatar_style: 'realistic',
        music_genre: form.music_genre || null,
        custom_instructions: form.custom_instructions || null,
        palette: form.palette || null,
        image_seed: seed,
        generate_image: true,
      })
      setPreview(result.preview)
    } catch (err) {
      console.error('Preview failed:', err)
    }
  }

  const handleSave = async () => {
    if (!form.niche.trim()) return
    try {
      const result = await createMutation.mutateAsync({
        niche: form.niche,
        language: form.language,
        ui_language: uiLanguage,
        name: preview?.name || form.name || null,
        bio: preview?.bio || form.bio || null,
        tone: form.tone,
        avatar_style: 'realistic',
        music_genre: form.music_genre || preview?.music_genre || null,
        custom_instructions: form.custom_instructions || null,
        palette: form.palette || null,
        image_seed: imageSeed,
        generate_image: true,
      })
      onSuccess?.(result.avatar)
      resetForm()
      onClose()
    } catch (err) {
      console.error('Create failed:', err)
    }
  }

  const resetForm = () => {
    setForm({
      niche: '', language: 'EN', name: '', bio: '',
      tone: 'engaging', music_genre: '', custom_instructions: '', palette: null,
    })
    setPreview(null)
    setImageSeed(null)
    lastPreviewKey.current = null
  }

  const handleClose = () => { resetForm(); onClose() }

  if (!isOpen) return null

  const isWorking = previewMutation.isPending || createMutation.isPending
  const hasContent = !!(preview?.image_url || previewMutation.isPending || form.niche)

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '880px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-xl)',
          animation: 'bcFadeUp 280ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* === Header === */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text)' }}>
              🎭 Create avatar
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              The portrait updates automatically as you type. Customize, or let AI decide.
            </p>
          </div>
          <button type="button" onClick={handleClose} style={closeBtnStyle}>×</button>
        </div>

        {/* === Top: Niche + Language (required) === */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <Field label="Niche" required>
              <input
                type="text"
                required
                autoFocus
                placeholder="tech, fitness, cooking..."
                value={form.niche}
                onChange={update('niche')}
                list="niche-suggestions"
                style={inputStyle}
              />
              <datalist id="niche-suggestions">
                {NICHES.map((n) => <option key={n} value={n} />)}
              </datalist>
            </Field>
            <Field label="Language">
              <select value={form.language} onChange={update('language')} style={inputStyle}>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* === Main: Image (left) + 2 boxes (right) === */}
        <div style={{
          padding: '20px 28px',
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: '20px',
        }}>
          {/* === LEFT: Live Image === */}
          <div>
            <div style={{
              width: '100%',
              aspectRatio: '1/1',
              borderRadius: 'var(--radius-md)',
              background: form.palette
                ? `linear-gradient(135deg, ${form.palette[0]}, ${form.palette[1]})`
                : 'var(--brand-gradient)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: preview?.image_url ? 'var(--shadow-md)' : 'none',
            }}>
              {preview?.image_url ? (
                <PreviewImage src={proxyImage(preview.image_url)} />
              ) : (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 8,
                  color: '#fff', fontSize: 12, textAlign: 'center', padding: 16,
                }}>
                  {previewMutation.isPending ? (
                    <>
                      <div style={{
                        width: 32, height: 32,
                        border: '4px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      <span>AI is generating portrait...</span>
                      <span style={{ fontSize: 10, opacity: 0.7 }}>5-30 seconds on first try</span>
                      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    </>
                  ) : !form.niche ? (
                    <>
                      <div style={{ fontSize: 32, opacity: 0.5 }}>🎭</div>
                      <span>Enter niche above to start</span>
                    </>
                  ) : (
                    <span>Preparing...</span>
                  )}
                </div>
              )}
            </div>

            {/* === BIG Regenerate button === */}
            <button
              type="button"
              onClick={() => generatePreview(true)}
              disabled={!form.niche.trim() || isWorking}
              style={{
                width: '100%',
                marginTop: 10,
                padding: '12px',
                background: previewMutation.isPending
                  ? 'var(--surface-2)'
                  : 'var(--brand-gradient)',
                color: previewMutation.isPending ? 'var(--text-muted)' : '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                fontWeight: 700,
                cursor: form.niche.trim() && !isWorking ? 'pointer' : 'not-allowed',
                opacity: form.niche.trim() && !isWorking ? 1 : 0.5,
                boxShadow: previewMutation.isPending ? 'none' : 'var(--shadow-glow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {previewMutation.isPending ? '⏳ Generating...' : '🔄 Regenerate portrait'}
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 4 }}>
              Click until you get one you love
            </div>

            <div style={{ marginTop: 8 }}>

              {preview?.name && (
                <div style={{
                  padding: 10,
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{preview.name}</div>
                  {preview.bio && (
                    <div style={{ color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                      {preview.bio}
                    </div>
                  )}
                  {preview.life_story && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}>
                        📖 Read life story
                      </summary>
                      <p style={{
                        marginTop: 6, fontSize: 11, color: 'var(--text-muted)',
                        lineHeight: 1.5, whiteSpace: 'pre-line',
                      }}>{preview.life_story}</p>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* === RIGHT: Two boxes === */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* === BOX 1: Personal Details === */}
            <Box title="👤 Personal Details" subtitle="Let AI invent or write your own">
              <Field label="Name" hint="blank → AI invents">
                <input type="text" placeholder="TechTom..." value={form.name} onChange={update('name')} style={inputStyle} />
              </Field>

              <Field label="Bio" hint="blank → AI writes">
                <textarea
                  placeholder="Short personality description"
                  value={form.bio}
                  onChange={update('bio')}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </Field>

              <Field label="Custom AI instructions" hint="free-form — anything">
                <textarea
                  placeholder="e.g. 'wears glasses, sounds like a sarcastic millennial'"
                  value={form.custom_instructions}
                  onChange={update('custom_instructions')}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </Field>
            </Box>

            {/* === BOX 2: Edit Style === */}
            <Box title="🎨 Edit Style" subtitle="Tone, music, and brand colors">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Tone">
                  <select value={form.tone} onChange={update('tone')} style={inputStyle}>
                    {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Music">
                  <select value={form.music_genre} onChange={update('music_genre')} style={inputStyle}>
                    {MUSIC_GENRES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Brand colors" hint="used in thumbnails, captions, transitions">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                  {PRESET_PALETTES.map((p) => {
                    const isSelected =
                      (p.colors === null && form.palette === null) ||
                      (p.colors && form.palette &&
                       p.colors[0] === form.palette[0] && p.colors[1] === form.palette[1])
                    return (
                      <button
                        key={p.name}
                        type="button"
                        title={p.name}
                        onClick={() => update('palette')(p.colors)}
                        style={{
                          padding: 0,
                          height: 32,
                          borderRadius: 'var(--radius-sm)',
                          background: p.colors
                            ? `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`
                            : 'var(--surface-2)',
                          border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                          cursor: 'pointer',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          boxShadow: isSelected ? '0 0 0 3px var(--primary-glow)' : 'none',
                          transition: 'all var(--transition-base)',
                        }}
                      >
                        {!p.colors && '🎲'}
                      </button>
                    )
                  })}
                </div>
                {form.palette && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {form.palette[0]} · {form.palette[1]}
                  </div>
                )}
              </Field>
            </Box>
          </div>
        </div>

        {/* === Footer: errors + actions === */}
        <div style={{
          padding: '16px 28px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          {(previewMutation.error || createMutation.error) && (
            <div style={{
              padding: '10px 12px',
              marginBottom: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.3)',
              fontSize: '12px',
            }}>
              ❌ {(previewMutation.error || createMutation.error).message}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isWorking}
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--surface)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!form.niche.trim() || isWorking}
              style={{
                flex: 2,
                padding: '12px',
                background: 'var(--brand-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: isWorking ? 'wait' : 'pointer',
                fontWeight: '700',
                fontSize: '13px',
                boxShadow: 'var(--shadow-glow)',
                opacity: !form.niche.trim() || isWorking ? 0.6 : 1,
              }}
            >
              {createMutation.isPending ? 'Saving...' : '✨ Create avatar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Image with explicit loading + error states (Pollinations is slow)
const PreviewImage = ({ src }) => {
  const [loaded, setLoaded] = React.useState(false)
  const [errored, setErrored] = React.useState(false)
  React.useEffect(() => { setLoaded(false); setErrored(false) }, [src])
  return (
    <>
      {!loaded && !errored && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8,
          color: '#fff', fontSize: 12, textAlign: 'center', padding: 16,
        }}>
          <div style={{
            width: 32, height: 32,
            border: '4px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span>Loading image from AI...</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>Pollinations Flux model</span>
        </div>
      )}
      {errored && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 6,
          color: '#fff', fontSize: 12, textAlign: 'center', padding: 16,
        }}>
          <div style={{ fontSize: 28 }}>⚠️</div>
          <span>Image failed to load</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>Try Regenerate below</span>
        </div>
      )}
      <img
        src={src}
        alt="Avatar preview"
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

const Box = ({ title, subtitle, children }) => (
  <div style={{
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
  }}>
    <div style={{ marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      {subtitle && (
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-dim)' }}>{subtitle}</p>
      )}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
    </div>
  </div>
)

const Field = ({ label, hint, required, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
      {label}
      {required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
      {hint && <span style={{ color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: 6 }}>({hint})</span>}
    </label>
    {children}
  </div>
)

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box',
}

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  fontSize: 24,
  cursor: 'pointer',
  color: 'var(--text-muted)',
  padding: 0,
  lineHeight: 1,
}

export default NewAvatarModal
