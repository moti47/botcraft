/**
 * LanguagePicker — globe icon + dropdown in the topbar.
 *
 * The chosen language is the UI language AND the language used by the AI
 * when generating life stories, blueprints, scripts, and bios.
 * Persisted to localStorage so it survives reloads.
 */

import React, { useState, useRef, useEffect } from 'react'

const LANGUAGES = [
  { value: 'EN', label: 'English', flag: '🇺🇸' },
  { value: 'HE', label: 'עברית', flag: '🇮🇱', rtl: true },
  { value: 'ES', label: 'Español', flag: '🇪🇸' },
  { value: 'FR', label: 'Français', flag: '🇫🇷' },
  { value: 'DE', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'PT', label: 'Português', flag: '🇵🇹' },
  { value: 'IT', label: 'Italiano', flag: '🇮🇹' },
  { value: 'AR', label: 'العربية', flag: '🇸🇦', rtl: true },
  { value: 'JA', label: '日本語', flag: '🇯🇵' },
  { value: 'ZH', label: '中文', flag: '🇨🇳' },
]

export const LanguagePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = LANGUAGES.find((l) => l.value === value) || LANGUAGES[0]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change UI language"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          background: 'var(--surface-2)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: '600',
          transition: 'all var(--transition-base)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <span style={{ fontSize: '14px' }}>🌐</span>
        <span>{current.flag}</span>
        <span>{current.value}</span>
        <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          padding: '6px',
          minWidth: '180px',
          zIndex: 100,
          maxHeight: '320px',
          overflowY: 'auto',
        }}>
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => {
                onChange(l.value)
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '8px 10px',
                background: l.value === value ? 'var(--primary-glow)' : 'transparent',
                color: l.value === value ? 'var(--primary)' : 'var(--text)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: l.value === value ? '600' : '400',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (l.value !== value) e.currentTarget.style.background = 'var(--surface-2)'
              }}
              onMouseLeave={(e) => {
                if (l.value !== value) e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{ fontSize: '16px' }}>{l.flag}</span>
              <span style={{ flex: 1 }}>{l.label}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                {l.value}
              </span>
              {l.value === value && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const LANGUAGE_OPTIONS = LANGUAGES
export default LanguagePicker
