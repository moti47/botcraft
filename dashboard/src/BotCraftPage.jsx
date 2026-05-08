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
  STRINGS,
} from './BotCraftData'
import { useAuth } from './hooks/useAuth'
import { useAllRealtime } from './hooks/useRealtime'

const BotCraftPage = () => {
  const [lang, setLang] = useState(() => localStorage.getItem('botcraft-lang') || 'EN')
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showNotification, setShowNotification] = useState(null)
  const [newAvatarNiche, setNewAvatarNiche] = useState('')
  const [videoTopic, setVideoTopic] = useState('')
  const [videoScheduledFor, setVideoScheduledFor] = useState('')  // empty = produce now

  const strings = STRINGS[lang]
  const queryClient = useQueryClient()

  // === Auth (persistent session) ===
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth()

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
  const handleCreateAvatar = async (e) => {
    e.preventDefault()
    if (!newAvatarNiche.trim()) return

    try {
      await createAvatarMutation.mutateAsync({
        niche: newAvatarNiche,
        language: lang,
        tone: 'engaging',
      })
      setNewAvatarNiche('')
      setShowNotification({ type: 'success', msg: 'Avatar created! 🎭' })
      queryClient.invalidateQueries({ queryKey: ['avatars'] })
    } catch (err) {
      setShowNotification({ type: 'error', msg: 'Failed to create avatar' })
    }
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
      }}>
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-xl)',
          maxWidth: '400px',
        }}>
          <h1 style={{ color: 'var(--text)', marginBottom: '16px' }}>
            🎭 BotCraft
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Create AI avatars that generate, post, and grow on autopilot
          </p>
          <button
            onClick={signInWithGoogle}
            style={{
              background: 'var(--brand-gradient)',
              color: '#fff',
              padding: '12px 24px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '14px',
              boxShadow: 'var(--shadow-glow)',
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
          <button
            onClick={() => setLang(lang === 'EN' ? 'HE' : 'EN')}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
            }}
          >
            {lang === 'EN' ? 'עברית' : 'English'}
          </button>
          <div style={{
            marginTop: '12px',
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

            <button
              onClick={() => setCurrentPage('avatars')}
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
              ➕ {strings?.quickCreate || 'Quick create'}
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
      {/* Create Form */}
      <form onSubmit={onCreateAvatar} style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        marginBottom: '32px',
        display: 'flex',
        gap: '12px',
      }}>
        <input
          type="text"
          placeholder="Avatar niche (tech, fitness, comedy...)"
          value={newAvatarNiche}
          onChange={(e) => setNewAvatarNiche(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            color: 'var(--text)',
            background: 'var(--surface-2)',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            background: 'var(--brand-gradient)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-glow)',
          }}
        >
          Create Avatar
        </button>
      </form>

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
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '12px',
              background: a.grad,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '24px',
              fontWeight: 'bold',
              margin: '0 auto 12px',
            }}>
              {a.initial}
            </div>
            <h3 style={{
              margin: '0 0 4px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--text)',
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
          </div>
        ))}
      </div>
    </div>
  )
}

// === VIDEOS PAGE ===
const VideosPage = ({ videos, strings }) => {
  return (
    <div>
      <h2 style={{
        fontSize: '16px',
        fontWeight: '600',
        color: 'var(--text)',
        marginBottom: '16px',
      }}>
        {strings?.recentVideos || 'All videos'}
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
            {videos.map((v) => (
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
