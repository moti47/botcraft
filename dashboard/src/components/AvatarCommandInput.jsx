/**
 * AvatarCommandInput — natural-language refinement input
 *
 * Lets the user type commands like:
 *   "change music to hip-hop"
 *   "regenerate portrait"
 *   "make him more energetic"
 * The server interprets and updates the avatar.
 */

import React, { useState } from 'react'
import { useAvatarCommand } from '../BotCraftData'

const SUGGESTIONS = [
  '🎵 change music to electronic',
  '🎨 switch to cartoon style',
  '🖼️ regenerate portrait',
  '😏 make him more witty',
  '⏸️ pause this avatar',
]

export const AvatarCommandInput = ({ avatarId, onUpdate }) => {
  const [command, setCommand] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const mutation = useAvatarCommand()

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const cmd = command.trim()
    if (!cmd) return

    try {
      const result = await mutation.mutateAsync({ avatar_id: avatarId, command: cmd })
      setCommand('')
      onUpdate?.(result)
    } catch (err) {
      console.error('Command failed:', err)
    }
  }

  const useSuggestion = (s) => {
    // Strip emoji from start
    const cmd = s.replace(/^[^\s]+\s/, '')
    setCommand(cmd)
    setShowSuggestions(false)
  }

  return (
    <div style={{ marginTop: '10px' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '6px' }}>
        <input
          type="text"
          placeholder="Tell AI to update..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          disabled={mutation.isPending}
          style={{
            flex: 1,
            padding: '7px 10px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
        <button
          type="submit"
          disabled={mutation.isPending || !command.trim()}
          style={{
            padding: '7px 12px',
            background: 'var(--brand-gradient)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: mutation.isPending ? 'wait' : 'pointer',
            fontSize: '11px',
            fontWeight: '600',
            opacity: mutation.isPending || !command.trim() ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {mutation.isPending ? '...' : '→'}
        </button>
      </form>

      {showSuggestions && !command && (
        <div style={{
          marginTop: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); useSuggestion(s) }}
              style={{
                textAlign: 'left',
                padding: '5px 8px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '10px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {mutation.data?.message && (
        <div style={{
          marginTop: '6px',
          padding: '6px 8px',
          fontSize: '10px',
          background: 'var(--success-bg)',
          color: 'var(--success)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(16,185,129,0.3)',
        }}>
          ✓ {mutation.data.message}
        </div>
      )}

      {mutation.error && (
        <div style={{
          marginTop: '6px',
          padding: '6px 8px',
          fontSize: '10px',
          background: 'var(--danger-bg)',
          color: 'var(--danger)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
          ❌ {mutation.error.message}
        </div>
      )}
    </div>
  )
}

export default AvatarCommandInput
