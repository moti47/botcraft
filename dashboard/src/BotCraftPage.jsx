/**
 * BotCraft Dashboard — Main UI Integration
 *
 * Complete dashboard layout using BotCraft design system.
 * Integrates real Supabase data with BotCraft UI Kit components.
 */

import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/api'
import {
  useMockData,
  useCreateAvatar,
  useProduceVideo,
  proxyImage,
  STRINGS,
} from './BotCraftData'
import { useAuth } from './hooks/useAuth'
import { useAllRealtime } from './hooks/useRealtime'
import { NewAvatarModal } from './components/NewAvatarModal'
import { AvatarCommandInput } from './components/AvatarCommandInput'
import { AvatarDetailModal } from './components/AvatarDetailModal'
import { LanguagePicker } from './components/LanguagePicker'
import { VideoPreviewModal } from './components/VideoPreviewModal'

const BotCraftPage = () => {
  const [lang, setLang] = useState(() => localStorage.getItem('botcraft-lang') || 'EN')
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showNotification, setShowNotification] = useState(null)
  const [newAvatarNiche, setNewAvatarNiche] = useState('')
  const [videoTopic, setVideoTopic] = useState('')
  const [videoScheduledFor, setVideoScheduledFor] = useState('')  // empty = produce now
  const [showNewAvatarModal, setShowNewAvatarModal] = useState(false)
  const [selectedAvatarId, setSelectedAvatarId] = useState(null)

  const strings = STRINGS[lang]
  const queryClient = useQueryClient()

  // === Auth (persistent session) ===
  const {
    user, loading: authLoading, error: authError,
    signInWithGoogle, signInWithEmail, signUpWithEmail, signOut,
  } = useAuth()

  // === Login form state ===
  const [authMode, setAuthMode] = useState('signin')  // 'signin' | 'signup'
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState(null)

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setAuthMessage(null)
    if (!authEmail || !authPassword) {
      setAuthMessage({ type: 'error', text: 'Enter both email and password' })
      return
    }
    if (authPassword.length < 6) {
      setAuthMessage({ type: 'error', text: 'Password must be 6+ characters' })
      return
    }
    const fn = authMode === 'signup' ? signUpWithEmail : signInWithEmail
    const { error } = await fn(authEmail, authPassword)
    if (error) {
      setAuthMessage({ type: 'error', text: error.message })
    } else if (authMode === 'signup') {
      setAuthMessage({
        type: 'success',
        text: 'Account created! Check your email to confirm (or sign in if confirmation is off).',
      })
    }
  }

  // === Realtime (live data updates via WebSocket) ===
  useAllRealtime(user?.id)

  // === RTL Support ===
  useEffect(() => {
    document.documentElement.dir = lang === 'HE' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang === 'HE' ? 'he' : 'en'
    localStorage.setItem('botcraft-lang', lang)
  }, [lang])

  // === Data Hooks ===
  const { data: mockData = {}, isLoading } = useMockData()
  const createAvatarMutation = useCreateAvatar()
  const produceVideoMutation = useProduceVideo()

  // === Handlers ===
  // Opens the rich modal (replaces the old inline form)
  const handleCreateAvatar = () => {
    setShowNewAvatarModal(true)
  }

  const onAvatarCreated = (avatar) => {
    setShowNotification({
      type: 'success',
      msg: `Avatar "${avatar.name}" created! 🎭`,
    })
    queryClient.invalidateQueries({ queryKey: ['avatars'] })
  }

  const handleProduceVideo = async (avatarId) => {
    try {
      // Convert datetime-local input to ISO 8601 (or null for "produce now")
      const scheduled_for = videoScheduledFor
        ? new Date(videoScheduledFor).toISOString()
        : null

      await produceVideoMutation.mutateAsync({
        avatar_id: avatarId,
        topic: videoTopic || null,
        scheduled_for,
      })
      setVideoTopic('')
      setVideoScheduledFor('')
      setShowNotification({
        type: 'success',
        msg: scheduled_for
          ? `Video scheduled for ${new Date(scheduled_for).toLocaleString()} ⏰`
          : 'Video queued! 🎬',
      })
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    } catch (err) {
      setShowNotification({ type: 'error', msg: 'Failed to produce video' })
    }
  }

  // === Auth UI ===
  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-body)',
      }}>
        Loading session...
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--brand-gradient)',
        fontFamily: 'var(--font-body)',
        padding: '20px',
      }}>
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px',
          boxShadow: 'var(--shadow-xl)',
          width: '100%',
          maxWidth: '400px',
        }}>
          <h1 style={{ color: 'var(--text)', marginBottom: '8px', textAlign: 'center' }}>
            🎭 BotCraft
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', textAlign: 'center', fontSize: '13px' }}>
            {authMode === 'signup'
              ? 'Create an account to start crafting AI personas'
              : 'Welcome back — sign in to continue'}
          </p>

          {/* Email / Password form */}
          <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="email"
              placeholder="you@example.com"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              autoComplete="email"
              required
              style={{
                padding: '10px 14px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            />
            <input
              type="password"
              placeholder="••••••• (6+ chars)"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              style={{
                padding: '10px 14px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            />
            <button
              type="submit"
              disabled={authLoading}
              style={{
                background: 'var(--brand-gradient)',
                color: '#fff',
                padding: '12px 24px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 'bold',
                cursor: authLoading ? 'wait' : 'pointer',
                fontSize: '14px',
                boxShadow: 'var(--shadow-glow)',
                opacity: authLoading ? 0.7 : 1,
              }}
            >
              {authLoading ? '...' : authMode === 'signup' ? '🚀 Create account' : '🔑 Sign in'}
            </button>
          </form>

          {/* Toggle signup/signin */}
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
            {authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'signup' ? 'signin' : 'signup')
                setAuthMessage(null)
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                fontWeight: '600',
                padding: 0,
              }}
            >
              {authMode === 'signup' ? 'Sign in' : 'Create one'}
            </button>
          </div>

          {/* Status message */}
          {authMessage && (
            <div style={{
              marginTop: '16px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              background: authMessage.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
              color: authMessage.type === 'error' ? 'var(--danger)' : 'var(--success)',
              border: `1px solid ${authMessage.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
            }}>
              {authMessage.text}
            </div>
          )}

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '20px 0',
            color: 'var(--text-dim)',
            fontSize: '11px',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          {/* Google OAuth (optional, fails gracefully if not configured) */}
          <button
            onClick={signInWithGoogle}
            disabled={authLoading}
            style={{
              width: '100%',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              padding: '10px 24px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Continue with Google
          </button>
        </div>
      </div>
    )
  }

  // === Main UI ===
  const { avatars = [], videos = [], kpis = [], insights = [] } = mockData

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg)',
      fontFamily: 'var(--font-body)',
    }}>
      {/* === SIDEBAR === */}
      <aside style={{
        width: sidebarOpen ? 260 : 60,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width var(--transition-base)',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 16px',
          fontSize: '20px',
          fontWeight: 'bold',
          color: 'var(--primary)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          {sidebarOpen ? '🎭 BotCraft' : '🎭'}
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '16px 8px' }}>
          {Object.entries({
            dashboard: 'Dashboard',
            avatars: 'Avatars',
            videos: 'Videos',
            trends: 'Trends',
            analytics: 'Analytics',
            learnings: 'Learnings',
            settings: 'Settings',
          }).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCurrentPage(key)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: '4px',
                background: currentPage === key ? 'var(--primary-glow)' : 'transparent',
                color: currentPage === key ? 'var(--primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: currentPage === key ? 'bold' : 'normal',
                transition: 'all var(--transition-base)',
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {sidebarOpen ? label : label[0]}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 8px',
          borderTop: '1px solid var(--border)',
        }}>
          <div style={{
            marginTop: '0',
            padding: '8px',
            fontSize: '11px',
            color: 'var(--text-dim)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {sidebarOpen && user?.email}
          </div>
          <button
            onClick={signOut}
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '8px 12px',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
            }}
          >
            {sidebarOpen ? 'Sign out' : '↓'}
          </button>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'absolute',
            right: '-12px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '24px',
            height: '24px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
          }}
        >
          {sidebarOpen ? '‹' : '›'}
        </button>
      </aside>

      {/* === MAIN CONTENT === */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Topbar */}
        <header style={{
          padding: '16px 24px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: '600',
              color: 'var(--text)',
            }}>
              {strings?.nav?.[currentPage] || 'Dashboard'}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              position: 'relative',
              flex: 1,
              minWidth: '200px',
            }}>
              <input
                type="text"
                placeholder={strings?.search || 'Search...'}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                }}
              />
              <span style={{
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}>
                🔍
              </span>
            </div>

            <div style={{
              padding: '6px 12px',
              background: 'var(--surface-2)',
              borderRadius: '999px',
              fontSize: '11px',
              color: 'var(--text-dim)',
              border: '1px solid var(--border)',
            }}>
              {mockData?.notifications || 0} notifications
            </div>

            <LanguagePicker value={lang} onChange={setLang} />

            <button
              onClick={() => setShowNewAvatarModal(true)}
              style={{
                padding: '8px 16px',
                background: 'var(--brand-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              ➕ New avatar
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
        }}>
          {isLoading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: 'var(--text-muted)',
            }}>
              Loading...
            </div>
          ) : currentPage === 'dashboard' ? (
            <DashboardPage mockData={mockData} strings={strings} />
          ) : currentPage === 'avatars' ? (
            <AvatarsPage
              avatars={avatars}
              strings={strings}
              onCreateAvatar={handleCreateAvatar}
              onProduceVideo={handleProduceVideo}
              onSelectAvatar={setSelectedAvatarId}
              newAvatarNiche={newAvatarNiche}
              setNewAvatarNiche={setNewAvatarNiche}
              videoTopic={videoTopic}
              setVideoTopic={setVideoTopic}
              videoScheduledFor={videoScheduledFor}
              setVideoScheduledFor={setVideoScheduledFor}
              isLoading={createAvatarMutation.isPending || produceVideoMutation.isPending}
            />
          ) : currentPage === 'videos' ? (
            <VideosPage videos={videos} strings={strings} />
          ) : (
            <PlaceholderPage page={currentPage} />
          )}
        </div>
      </main>

      {/* === NOTIFICATION === */}
      {showNotification && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '12px 16px',
          background: showNotification.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
          color: showNotification.type === 'error' ? 'var(--danger)' : 'var(--success)',
          border: `1px solid ${showNotification.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          fontWeight: '600',
          animation: 'bcFadeUp var(--transition-base)',
        }}>
          {showNotification.msg}
        </div>
      )}

      {/* === NEW AVATAR MODAL === */}
      <NewAvatarModal
        isOpen={showNewAvatarModal}
        onClose={() => setShowNewAvatarModal(false)}
        onSuccess={onAvatarCreated}
        uiLanguage={lang}
      />

      {/* === AVATAR DETAIL MODAL === */}
      <AvatarDetailModal
        avatar={avatars.find((a) => a.id === selectedAvatarId)}
        isOpen={!!selectedAvatarId}
        onClose={() => setSelectedAvatarId(null)}
      />
    </div>
  )
}

// === DASHBOARD PAGE ===
const DashboardPage = ({ mockData, strings }) => {
  const { kpis = [], videos = [], insights = [] } = mockData

  return (
    <div>
      {/* KPI Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {kpis.map((kpi, i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px',
              boxShadow: 'var(--inner-glow)',
            }}
          >
            <div style={{
              fontSize: '11px',
              fontWeight: '600',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px',
            }}>
              {kpi.label}
            </div>
            <div style={{
              fontSize: '32px',
              fontWeight: '600',
              color: kpi.gradient ? 'transparent' : 'var(--text)',
              background: kpi.gradient ? 'var(--brand-gradient)' : 'none',
              WebkitBackgroundClip: kpi.gradient ? 'text' : 'unset',
              WebkitTextFillColor: kpi.gradient ? 'transparent' : 'unset',
              fontFeatureSettings: "'tnum' 1",
              margin: '8px 0 4px',
            }}>
              {kpi.value}
            </div>
            <div style={{
              fontSize: '12px',
              color: 'var(--success)',
              fontFamily: 'var(--font-mono)',
            }}>
              ↑ {kpi.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Videos */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '16px',
          fontWeight: '600',
          color: 'var(--text)',
          marginBottom: '16px',
        }}>
          {strings?.recentVideos || 'Recent videos'}
        </h2>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: 'var(--text-muted)',
                  background: 'var(--surface-2)',
                }}>
                  Title
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: 'var(--text-muted)',
                  background: 'var(--surface-2)',
                }}>
                  Avatar
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: 'var(--text-muted)',
                  background: 'var(--surface-2)',
                }}>
                  Status
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: 'var(--text-muted)',
                  background: 'var(--surface-2)',
                }}>
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {videos.slice(0, 5).map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--text)' }}>
                    {v.title}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                    {v.avatar}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '600',
                      background: v.status === 'ready' ? 'var(--success-bg)' : v.status === 'processing' ? 'rgba(6,182,212,0.12)' : 'var(--surface-2)',
                      color: v.status === 'ready' ? 'var(--success)' : v.status === 'processing' ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                      {v.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-dim)' }}>
                    {v.created}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div>
          <h2 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: 'var(--text)',
            marginBottom: '16px',
          }}>
            {strings?.insights || 'AI insights'}
          </h2>
          <div style={{
            display: 'grid',
            gap: '12px',
          }}>
            {insights.map((i, idx) => (
              <div
                key={idx}
                style={{
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(6,182,212,0.08))',
                  border: '1px solid rgba(167,139,250,0.2)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 16px',
                  fontSize: '12px',
                  color: 'var(--text)',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span>✨</span>
                  <div>
                    <p style={{ margin: '0 0 4px', color: 'var(--text)' }}>
                      {i.text}
                    </p>
                    <span style={{
                      fontSize: '10px',
                      color: 'var(--text-dim)',
                    }}>
                      Confidence: {i.confidence}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// === AVATARS PAGE ===
const AvatarsPage = ({
  avatars,
  strings,
  onCreateAvatar,
  onProduceVideo,
  onSelectAvatar,
  newAvatarNiche,
  setNewAvatarNiche,
  videoTopic,
  setVideoTopic,
  videoScheduledFor,
  setVideoScheduledFor,
  isLoading,
}) => {
  return (
    <div>
      {/* Big Create button */}
      <button
        type="button"
        onClick={onCreateAvatar}
        style={{
          width: '100%',
          padding: '24px',
          background: 'var(--brand-gradient)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '32px',
          fontSize: '15px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-glow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
        }}
      >
        ✨ New avatar — AI fills in the rest
      </button>

      {avatars.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: 'var(--text-muted)',
          fontSize: '13px',
        }}>
          No avatars yet. Click the button above to create your first one! 🎭
        </div>
      )}


      {/* Avatars Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px',
      }}>
        {avatars.map((a) => (
          <div
            key={a.id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              textAlign: 'center',
              transition: 'all var(--transition-base)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <button
              type="button"
              onClick={() => onSelectAvatar?.(a.id)}
              title="Click to view details"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '14px',
                background: a.grad,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '28px',
                fontWeight: 'bold',
                margin: '0 auto 12px',
                overflow: 'hidden',
                backgroundImage: a.image_url ? `url(${proxyImage(a.image_url)})` : a.grad,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'transform var(--transition-base), box-shadow var(--transition-base)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)'
                e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {!a.image_url && a.initial}
            </button>
            {a.bio && (
              <p style={{
                margin: '0 0 8px',
                fontSize: '11px',
                color: 'var(--text-muted)',
                lineHeight: 1.4,
                minHeight: '32px',
              }}>
                {a.bio}
              </p>
            )}
            <h3
              onClick={() => onSelectAvatar?.(a.id)}
              style={{
                margin: '0 0 4px',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text)',
                cursor: 'pointer',
              }}>
              {a.name}
            </h3>
            <p style={{
              margin: '0 0 8px',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}>
              {a.niche}
            </p>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: 'var(--text-dim)',
              marginBottom: '12px',
            }}>
              <span>{a.videos} videos</span>
              <span style={{
                padding: '2px 6px',
                borderRadius: '4px',
                background: a.status === 'active' ? 'var(--success-bg)' : 'var(--surface-2)',
                color: a.status === 'active' ? 'var(--success)' : 'var(--text-dim)',
              }}>
                {a.status}
              </span>
            </div>

            {/* Produce video controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              <input
                type="text"
                placeholder="Topic (optional - AI picks trend if blank)"
                value={videoTopic}
                onChange={(e) => setVideoTopic(e.target.value)}
                style={{
                  padding: '6px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                }}
              />
              <input
                type="datetime-local"
                value={videoScheduledFor}
                onChange={(e) => setVideoScheduledFor(e.target.value)}
                title="Leave blank to produce now"
                style={{
                  padding: '6px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                }}
              />
              <button
                disabled={isLoading}
                onClick={() => onProduceVideo(a.id)}
                style={{
                  padding: '8px',
                  background: 'var(--brand-gradient)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: isLoading ? 'wait' : 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {videoScheduledFor ? '⏰ Schedule' : '🎬 Produce now'}
              </button>
            </div>

            {/* Natural-language command input — refine the avatar */}
            <AvatarCommandInput avatarId={a.id} />
          </div>
        ))}
      </div>
    </div>
  )
}

// === VIDEOS PAGE ===
// Pipeline stages in production order. Weight each by typical seconds the
// stage takes — measured from real runs. These let us turn a stage name
// into a percent-complete + ETA without instrumenting the backend further.
const PIPELINE_STAGES = [
  { id: 'starting',   label: 'Starting',          seconds: 1  },
  { id: 'director',   label: '🎬 AI Director',    seconds: 6  },
  { id: 'script',     label: '✍️ Writing script', seconds: 1  },
  { id: 'audio',      label: '🎙️ Audio',          seconds: 3  },
  { id: 'thumbnail',  label: '🖼️ Thumbnail',      seconds: 1  },
  { id: 'finalizing', label: '✅ Finalizing',     seconds: 1  },
]
const TOTAL_PIPELINE_SECONDS = PIPELINE_STAGES.reduce((s, x) => s + x.seconds, 0)

function getStageProgress(video, nowMs) {
  // Terminal states
  if (video.status === 'ready_for_review' || video.status === 'ready' || video.status === 'posted') {
    return { pct: 100, label: 'Done', eta: 0, terminal: 'success' }
  }
  if (video.status === 'failed' || video.status === 'discarded') {
    return {
      pct: 100, label: video.stage_error ? `Failed at ${video.stage_error}` : 'Failed',
      eta: 0, terminal: 'failed', errorMessage: video.error_message,
    }
  }

  // Active pipeline — find current stage
  const cur = video.currently_in || 'starting'
  const idx = PIPELINE_STAGES.findIndex((s) => s.id === cur)
  if (idx === -1) {
    // Pipeline hasn't reported a stage yet (just queued)
    return { pct: 5, label: 'Queued', eta: TOTAL_PIPELINE_SECONDS }
  }

  // Seconds completed by the stages that already finished
  const completedSec = PIPELINE_STAGES.slice(0, idx).reduce((s, x) => s + x.seconds, 0)

  // Within the current stage, estimate progress by elapsed wall time since
  // the stage started (from render_options.stages[stageId] timestamp).
  const stageStartedAt = video.stages?.[cur] ? new Date(video.stages[cur]).getTime() : nowMs
  const elapsedInStage = Math.max(0, (nowMs - stageStartedAt) / 1000)
  const stageDuration = PIPELINE_STAGES[idx].seconds
  const inStageFrac = Math.min(1, elapsedInStage / stageDuration)

  const pct = Math.round(((completedSec + inStageFrac * stageDuration) / TOTAL_PIPELINE_SECONDS) * 100)
  const remainingSec = Math.max(0, TOTAL_PIPELINE_SECONDS - completedSec - inStageFrac * stageDuration)

  return {
    pct: Math.min(99, Math.max(5, pct)),
    label: PIPELINE_STAGES[idx].label,
    eta: Math.round(remainingSec),
  }
}

function VideoProgressRow({ video, tickMs, onOpen }) {
  const p = getStageProgress(video, tickMs)
  const isActive = !p.terminal
  const barColor = p.terminal === 'failed'
    ? 'var(--danger)'
    : p.terminal === 'success'
    ? 'var(--success)'
    : 'var(--brand-gradient)'

  return (
    <div
      onClick={() => onOpen?.(video.id)}
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '60px 1fr auto',
        gap: 14, alignItems: 'center',
        cursor: 'pointer',
        transition: 'background 150ms',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {/* Thumbnail */}
      <div style={{
        width: 60, height: 80,
        borderRadius: 'var(--radius-sm)',
        background: video.thumbnail_url ? `url(${video.thumbnail_url}) center/cover` : 'var(--brand-gradient)',
        flexShrink: 0,
      }} />

      {/* Title + progress */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text)',
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {video.title}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 400 }}>
            · {video.avatar}
          </span>
          {video.viral_score != null && (
            <span style={{
              padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: 'rgba(124,58,237,0.12)', color: 'var(--primary)',
            }}>
              🔥 {video.viral_score}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div style={{
          height: 8, borderRadius: 999,
          background: 'var(--surface-2)',
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            width: `${p.pct}%`, height: '100%',
            background: barColor,
            transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
            boxShadow: isActive ? '0 0 8px rgba(124,58,237,0.5)' : 'none',
          }} />
          {isActive && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
              animation: 'progShimmer 1.6s linear infinite',
              transform: `translateX(${-100 + p.pct}%)`,
              width: '40%',
            }} />
          )}
        </div>

        {/* Status line */}
        <div style={{
          marginTop: 5, display: 'flex', justifyContent: 'space-between',
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span>
            {p.label}
            {isActive && <> · {p.pct}%</>}
          </span>
          <span>
            {isActive
              ? `~${p.eta}s left`
              : p.terminal === 'failed'
              ? <span style={{ color: 'var(--danger)' }}>{p.errorMessage || 'failed'}</span>
              : video.created}
          </span>
        </div>
      </div>

      {/* Right: status pill */}
      <div style={{
        padding: '6px 10px',
        borderRadius: 999, fontSize: 10, fontWeight: 700,
        background: video.status === 'ready_for_review' || video.status === 'ready' || video.status === 'posted'
          ? 'var(--success-bg)'
          : video.status === 'failed' || video.status === 'discarded'
          ? 'rgba(239,68,68,0.12)'
          : 'rgba(6,182,212,0.12)',
        color: video.status === 'ready_for_review' || video.status === 'ready' || video.status === 'posted'
          ? 'var(--success)'
          : video.status === 'failed' || video.status === 'discarded'
          ? 'var(--danger)'
          : 'var(--accent)',
        whiteSpace: 'nowrap',
      }}>
        {video.status}
      </div>
    </div>
  )
}

const VideosPage = ({ videos, strings }) => {
  // Tick once per second so active progress bars advance smoothly without
  // refetching the DB. The DB poll happens on the parent's TanStack Query
  // refetch interval (we add one below if there are any active videos).
  const [tickMs, setTickMs] = React.useState(() => Date.now())
  // The video the user clicked → opens VideoPreviewModal to actually watch it.
  const [openVideoId, setOpenVideoId] = React.useState(null)
  const queryClient = useQueryClient()
  const hasActive = videos.some(
    (v) => v.status === 'queued' || v.status === 'processing'
  )

  React.useEffect(() => {
    if (!hasActive) return
    const id = setInterval(() => {
      setTickMs(Date.now())
      // Every 4 seconds also refetch to pick up real backend progress
      if (Math.floor(Date.now() / 1000) % 4 === 0) {
        queryClient.invalidateQueries({ queryKey: ['videos'] })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [hasActive, queryClient])

  return (
    <div>
      <style>{`@keyframes progShimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }`}</style>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {strings?.recentVideos || 'All videos'}
        </h2>
        {hasActive && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            🔄 Live updating · {videos.filter((v) => v.status === 'processing' || v.status === 'queued').length} in progress
          </span>
        )}
      </div>

      {videos.length === 0 ? (
        <div style={{
          padding: 60, textAlign: 'center',
          background: 'var(--surface)', border: '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)',
        }}>
          🎬 No videos yet — click <strong>Produce now</strong> on an avatar to start
        </div>
      ) : (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          {videos.map((v) => (
            <VideoProgressRow key={v.id} video={v} tickMs={tickMs} onOpen={setOpenVideoId} />
          ))}
        </div>
      )}

      {/* Click a row → opens the watchable preview */}
      <VideoPreviewModal
        videoId={openVideoId}
        isOpen={!!openVideoId}
        onClose={() => setOpenVideoId(null)}
      />
    </div>
  )
}

// === PLACEHOLDER PAGE ===
const PlaceholderPage = ({ page }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '400px',
      background: 'var(--surface)',
      borderRadius: 'var(--radius-lg)',
      border: '2px dashed var(--border)',
      color: 'var(--text-muted)',
      fontSize: '16px',
    }}>
      Coming soon: {page}
    </div>
  )
}

export default BotCraftPage
