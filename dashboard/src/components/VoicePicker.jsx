/**
 * VoicePicker — find & select a voice for the avatar
 *
 * Uses BROWSER's built-in SpeechSynthesis API for preview (free, instant,
 * works on every device — no backend needed).
 * Selected voice is saved to avatar.voice_id with prefix "browser:VoiceName"
 * so the video pipeline knows to use TTS via browser fallback or to swap to
 * a server provider later.
 */

import React, { useState, useEffect } from 'react'
import { useSetAvatarVoice } from '../BotCraftData'

export const VoicePicker = ({ avatar }) => {
  const [voices, setVoices] = useState([])
  const [playingName, setPlayingName] = useState(null)
  const [filter, setFilter] = useState('all')  // all | male | female
  const setVoice = useSetAvatarVoice()

  // Load browser voices
  useEffect(() => {
    const load = () => {
      const list = window.speechSynthesis?.getVoices?.() || []
      setVoices(list)
    }
    load()
    // Voices load asynchronously in some browsers
    window.speechSynthesis?.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load)
  }, [])

  // Stop any speech on unmount
  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  const sampleText = avatar?.bio ||
    (avatar?.life_story?.split('.').slice(0, 2).join('.')) ||
    `Hi, I'm ${avatar?.name}. Welcome to my channel.`

  // Score + tag voices based on avatar traits
  const scoredVoices = scoreVoices(voices, avatar)

  // Apply filter
  const filtered = filter === 'all' ? scoredVoices :
    scoredVoices.filter((v) => guessGender(v.voice) === filter)

  // Take top 12
  const topVoices = filtered.slice(0, 12)

  const handlePreview = (voice) => {
    if (playingName === voice.name) {
      window.speechSynthesis.cancel()
      setPlayingName(null)
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(sampleText)
    u.voice = voice
    u.rate = 1.0
    u.pitch = 1.0
    u.onend = () => setPlayingName(null)
    u.onerror = () => setPlayingName(null)
    setPlayingName(voice.name)
    window.speechSynthesis.speak(u)
  }

  const handleSelect = async (voice) => {
    try {
      await setVoice.mutateAsync({
        avatar_id: avatar.id,
        voice_id: `browser:${voice.name}`,
        voice_name: voice.name,
      })
    } catch (err) {
      console.error('Select failed:', err)
    }
  }

  const selectedId = avatar?.voice_id

  if (voices.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
        🔊 Loading browser voices... (your OS provides them)
        <div style={{ marginTop: 8, fontSize: 11 }}>
          If nothing loads, your browser may not support SpeechSynthesis.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['all', 'female', 'male'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px',
              background: filter === f ? 'var(--primary-glow)' : 'var(--surface-2)',
              color: filter === f ? 'var(--primary)' : 'var(--text-muted)',
              border: `1px solid ${filter === f ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f === 'all' ? '🎲 All' : f === 'female' ? '👩 Female' : '👨 Male'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {filtered.length} voices · using browser TTS
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflowY: 'auto' }}>
        {topVoices.map((entry, i) => {
          const { voice, score, tags } = entry
          const isSelected = selectedId === `browser:${voice.name}`
          const isPlaying = playingName === voice.name
          return (
            <div
              key={voice.name + voice.lang}
              style={{
                padding: 10,
                background: isSelected ? 'var(--primary-glow)' : 'var(--surface-2)',
                border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{
                width: 28, height: 28,
                background: i === 0 ? 'var(--brand-gradient)' : 'var(--surface)',
                color: i === 0 ? '#fff' : 'var(--text-muted)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}>{i + 1}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {voice.name}
                  </div>
                  {isSelected && <span style={{ fontSize: 9, color: 'var(--primary)', fontWeight: 700 }}>✓ SELECTED</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                  <Tag>{voice.lang}</Tag>
                  {tags.map((t, idx) => <Tag key={idx}>{t}</Tag>)}
                  {voice.localService && <Tag>local</Tag>}
                </div>
              </div>

              <div style={{
                padding: '3px 7px',
                background: score >= 70 ? 'var(--success-bg)' : 'var(--surface)',
                color: score >= 70 ? 'var(--success)' : 'var(--text-muted)',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-mono)',
                minWidth: 32, textAlign: 'center',
              }}>{score}</div>

              <button
                type="button"
                onClick={() => handlePreview(voice)}
                title={isPlaying ? 'Stop' : 'Preview'}
                style={{
                  width: 32, height: 32,
                  borderRadius: '50%',
                  background: isPlaying ? 'var(--danger)' : 'var(--surface)',
                  color: isPlaying ? '#fff' : 'var(--text)',
                  border: `1px solid ${isPlaying ? 'var(--danger)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >{isPlaying ? '⏹' : '▶'}</button>

              {!isSelected && (
                <button
                  type="button"
                  onClick={() => handleSelect(voice)}
                  disabled={setVoice.isPending}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--brand-gradient)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >Select</button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{
        marginTop: 12, padding: 10,
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
      }}>
        💬 Sample text being spoken: "{sampleText.slice(0, 100)}..."
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
const Tag = ({ children }) => (
  <span style={{
    padding: '1px 6px', fontSize: 9,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 999, color: 'var(--text-muted)',
  }}>{children}</span>
)

// Heuristic gender from voice name
function guessGender(voice) {
  const n = voice.name.toLowerCase()
  const female = ['female', 'samantha', 'siri', 'karen', 'tessa', 'fiona', 'moira', 'veena', 'kathy', 'allison', 'ava', 'susan', 'victoria', 'zira', 'hazel', 'eva', 'helena', 'ivy', 'jenny', 'aria', 'kalpana', 'sara', 'shelley', 'kyoko', 'mei', 'paulina', 'monica', 'milena', 'nicolas', 'serena', 'amelie', 'amelia', 'anna', 'audrey', 'clara', 'claire', 'celine']
  const male = ['male', 'alex', 'fred', 'daniel', 'tom', 'oliver', 'rishi', 'aaron', 'jorge', 'diego', 'reed', 'eddy', 'flo', 'rocko', 'jacques', 'thomas', 'guido', 'jeremy', 'mark', 'george', 'guy', 'james', 'ryan', 'arthur', 'antonio', 'paulo', 'maged', 'naayf']
  if (female.some((k) => n.includes(k))) return 'female'
  if (male.some((k) => n.includes(k))) return 'male'
  return 'neutral'
}

// Score voices against avatar traits
function scoreVoices(voices, avatar) {
  if (!avatar) return voices.map((v) => ({ voice: v, score: 50, tags: [] }))

  const brand = avatar.brand_identity || {}
  const physical = String(brand.physical_description || '').toLowerCase()
  const lifeStory = String(avatar.life_story || '').toLowerCase()
  const lang = String(avatar.language || 'EN').toLowerCase()

  // Infer wanted gender from physical description
  let wantedGender = null
  if (/\b(woman|female|girl|\bshe\b|\bher\b)/.test(physical)) wantedGender = 'female'
  if (/\b(man|male|guy|\bhe\b|\bhis\b)/.test(physical)) wantedGender = 'male'

  return voices
    .map((v) => {
      let score = 50
      const tags = []
      const g = guessGender(v)

      // Language match
      if (v.lang.toLowerCase().startsWith(lang)) {
        score += 25
        tags.push('lang ✓')
      } else if (lang === 'en' && v.lang.toLowerCase().startsWith('en')) {
        score += 25
      } else {
        score -= 10
      }

      // Gender match
      if (wantedGender && g === wantedGender) {
        score += 30
        tags.push(`${g} ✓`)
      } else if (wantedGender && g !== 'neutral' && g !== wantedGender) {
        score -= 20
        tags.push(g)
      } else {
        tags.push(g)
      }

      // Prefer non-local (better quality usually) but boost local for fallback
      if (!v.localService) score += 5

      // Name quality hints
      const n = v.name.toLowerCase()
      if (n.includes('premium') || n.includes('enhanced') || n.includes('natural')) {
        score += 10
        tags.push('premium')
      }

      return { voice: v, score: Math.max(0, Math.min(100, Math.round(score))), tags }
    })
    .sort((a, b) => b.score - a.score)
}

export default VoicePicker
