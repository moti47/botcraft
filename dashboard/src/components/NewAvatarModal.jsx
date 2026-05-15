/**
 * NewAvatarModal — two-step avatar creation
 *
 * Step 1: User picks niche + language + tone + custom instructions.
 *         Clicks "✨ Generate persona info" → LLM fills name, bio, life story,
 *         and physical description into EDITABLE text fields. No image yet.
 *
 * Step 2: User reviews / edits the text. Clicks "🎨 Generate portrait" →
 *         image is drawn from the (possibly edited) physical_description +
 *         a locked seed. User can click again for a different angle (new seed)
 *         without re-rolling the persona text.
 *
 * Step 3: "💾 Save avatar" persists exactly what's on screen.
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
    life_story: '',
    physical_description: '',
    tone: 'engaging',
    music_genre: '',
    custom_instructions: '',
    palette: null,  // null = AI picks
  })
  // imageUrl & imageSeed track the portrait separately from form text, so
  // editing text doesn't blow away the image until the user clicks regen.
  const [imageUrl, setImageUrl] = useState(null)
  const [imageSeed, setImageSeed] = useState(null)
  // Flag the "image is stale" — text changed since the last portrait gen.
  const [imageStale, setImageStale] = useState(false)

  const previewMutation = useAvatarPreview()
  const createMutation = useCreateAvatar()

  const update = (field) => (e) => {
    const value = e?.target?.value !== undefined ? e.target.value : e
    setForm((f) => ({ ...f, [field]: value }))
    // If user edits any text that drives the portrait, mark the current
    // image as stale so they know to re-generate.
    if (['name', 'physical_description', 'tone', 'palette', 'custom_instructions'].includes(field)) {
      setImageStale(true)
    }
  }

  // STEP 1: Generate persona text into the editable fields (no image).
  const generateInfo = async () => {
    if (!form.niche.trim()) return
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
        generate_image: false,   // ← text only, no Pollinations call
      })
      const p = result.preview || {}
      // Fill empty fields, but DON'T overwrite anything the user already typed.
      setForm((f) => ({
        ...f,
        name:                 f.name || p.name || '',
        bio:                  f.bio || p.bio || '',
        life_story:           f.life_story || p.life_story || '',
        physical_description: f.physical_description || p.physical_description || '',
        music_genre:          f.music_genre || p.music_genre || '',
        palette:              f.palette || p.brand_identity?.palette || null,
      }))
      setImageStale(true)  // text just changed — portrait (if any) is now stale
    } catch (err) {
      console.error('Generate info failed:', err)
    }
  }

  // STEP 2: Generate (or regenerate) the portrait from the current form text.
  // Re-uses the existing physical_description and locks a seed so the user
  // can iterate on angles without losing the persona text.
  const generatePortrait = async (newSeed = false) => {
    if (!form.niche.trim()) return
    if (!form.physical_description.trim()) {
      // No description yet — generate persona text first, then portrait
      await generateInfo()
    }
    const seed = newSeed || !imageSeed
      ? Math.floor(Math.random() * 1_000_000)
      : imageSeed
    setImageSeed(seed)
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
        // Lock in EXACTLY what's in the form so the image matches the text
        life_story: form.life_story || null,
        physical_description: form.physical_description || null,
        short_bio: form.bio || null,
      })
      setImageUrl(result.preview?.image_url || null)
      setImageStale(false)
    } catch (err) {
      console.error('Generate portrait failed:', err)
    }
  }

  const handleSave = async () => {
    if (!form.niche.trim()) return
    try {
      const result = await createMutation.mutateAsync({
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
        image_seed: imageSeed,
        generate_image: !!imageUrl,   // only ask for image if one was generated
        // Lock in the exact persona shown so the saved avatar's portrait
        // matches the preview the user approved.
        life_story: form.life_story || null,
        physical_description: form.physical_description || null,
        short_bio: form.bio || null,
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
      life_story: '', physical_description: '',
      tone: 'engaging', music_genre: '', custom_instructions: '', palette: null,
    })
    setImageUrl(null)
    setImageSeed(null)
    setImageStale(false)
  }

  const handleClose = () => { resetForm(); onClose() }

  if (!isOpen) return null

  const isWorking = previewMutation.isPending || createMutation.isPending
  const hasPersonaText = !!(form.name || form.life_story || form.physical_description)

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
              Step 1: generate persona info. Step 2: edit if you want. Step 3: generate portrait.
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
              {imageUrl ? (
                <PreviewImage src={proxyImage(imageUrl)} />
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
                      <span>AI is generating...</span>
                      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    </>
                  ) : !form.niche ? (
                    <>
                      <div style={{ fontSize: 32, opacity: 0.5 }}>🎭</div>
                      <span>Enter niche → generate info → generate portrait</span>
                    </>
                  ) : !hasPersonaText ? (
                    <>
                      <div style={{ fontSize: 28, opacity: 0.6 }}>📝</div>
                      <span>Click "Generate persona info" first</span>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 28, opacity: 0.6 }}>🎨</div>
                      <span>Click "Generate portrait" below</span>
                    </>
                  )}
                </div>
              )}

              {/* Stale indicator overlay */}
              {imageUrl && imageStale && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  padding: '4px 8px',
                  background: 'rgba(0,0,0,0.6)',
                  color: '#FCD34D', fontSize: 10, fontWeight: 700,
                  borderRadius: 'var(--radius-sm)',
                }}>⚠️ text changed</div>
              )}
            </div>

            {/* === STEP 1: Generate persona info === */}
            <button
              type="button"
              onClick={generateInfo}
              disabled={!form.niche.trim() || isWorking}
              style={{
                width: '100%',
                marginTop: 10,
                padding: '11px',
                background: hasPersonaText ? 'var(--surface)' : 'var(--brand-gradient)',
                color: hasPersonaText ? 'var(--text)' : '#fff',
                border: hasPersonaText ? '1px solid var(--border)' : 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                fontWeight: 700,
                cursor: form.niche.trim() && !isWorking ? 'pointer' : 'not-allowed',
                opacity: form.niche.trim() && !isWorking ? 1 : 0.5,
                boxShadow: hasPersonaText ? 'none' : 'var(--shadow-glow)',
              }}
            >
              {previewMutation.isPending && !imageUrl
                ? '⏳ Thinking...'
                : hasPersonaText
                ? '🔁 Regenerate persona info'
                : '✨ Generate persona info'}
            </button>

            {/* === STEP 2: Generate portrait === */}
            <button
              type="button"
              onClick={() => generatePortrait(!!imageUrl)}
              disabled={!form.niche.trim() || isWorking}
              style={{
                width: '100%',
                marginTop: 8,
                padding: '12px',
                background: hasPersonaText
                  ? 'var(--brand-gradient)'
                  : 'var(--surface-2)',
                color: hasPersonaText ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                fontWeight: 700,
                cursor: form.niche.trim() && !isWorking ? 'pointer' : 'not-allowed',
                opacity: form.niche.trim() && !isWorking ? 1 : 0.5,
                boxShadow: hasPersonaText && !imageUrl ? 'var(--shadow-glow)' : 'none',
              }}
            >
              {previewMutation.isPending && hasPersonaText
                ? '⏳ Drawing portrait...'
                : imageUrl
                ? '🔄 New angle (same persona)'
                : '🎨 Generate portrait'}
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 4 }}>
              Step 1: fill the text. Step 2: draw the face.
            </div>
          </div>

          {/* === RIGHT: Two boxes === */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* === BOX 1: Personal Details === */}
            <Box title="👤 Personal Details" subtitle="Generated by AI, fully editable">
              <Field label="Name" hint="edit freely">
                <input type="text" placeholder="TechTom..." value={form.name} onChange={update('name')} style={inputStyle} />
              </Field>

              <Field label="Bio" hint="one-line tagline">
                <textarea
                  placeholder="Short personality description"
                  value={form.bio}
                  onChange={update('bio')}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </Field>

              <Field label="Life story" hint="multi-paragraph backstory in chosen language">
                <textarea
                  placeholder="Click ✨ Generate persona info to fill"
                  value={form.life_story}
                  onChange={update('life_story')}
                  rows={5}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </Field>

              <Field label="Physical description (English)" hint="drives the portrait — edit to change the face">
                <textarea
                  placeholder="32-year-old East Asian woman with short black hair, hazel eyes, modern hoodie..."
                  value={form.physical_description}
                  onChange={update('physical_description')}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }}
                />
              </Field>

              <Field label="Custom AI instructions" hint="anything else for the LLM to know">
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
