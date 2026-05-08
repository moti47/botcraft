/**
 * BotCraft Page
 *
 * Main entry point that wraps the BotCraft UI Kit
 * Provides real data + callbacks via props
 */

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/api'
import {
  useMockData,
  useCreateAvatar,
  useProduceVideo,
  STRINGS,
} from '../BotCraftData'

const BotCraftPage = () => {
  const [user, setUser] = useState(null)
  const [signedIn, setSignedIn] = useState(false)
  const [lang, setLang] = useState(localStorage.getItem('bc-lang') || 'EN')

  const { data: mockData, isLoading } = useMockData()
  const createAvatarMutation = useCreateAvatar()
  const produceVideoMutation = useProduceVideo()

  // === Auth ===
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user
      setUser(u)
      setSignedIn(!!u)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => {
        const u = session?.user
        setUser(u)
        setSignedIn(!!u)
      }
    )

    return () => subscription?.unsubscribe()
  }, [])

  // === Sidebar ===
  const [page, setPage] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [openVideo, setOpenVideo] = useState(null)
  const [openAvatar, setOpenAvatar] = useState(null)
  const [newAvatar, setNewAvatar] = useState(false)
  const [toast, setToast] = useState(null)

  const t = STRINGS[lang]

  useEffect(() => {
    document.documentElement.dir = lang === 'HE' ? 'rtl' : 'ltr'
    localStorage.setItem('bc-lang', lang)
  }, [lang])

  useEffect(() => {
    setOpenAvatar(null)
  }, [page])

  const toggleLang = () => setLang(l => l === 'EN' ? 'HE' : 'EN')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // === Callbacks ===
  const handleCreateAvatar = async (formData) => {
    try {
      await createAvatarMutation.mutateAsync(formData)
      showToast(lang === 'HE' ? '🚀 האווטר נוצר!' : '🚀 Avatar created!')
      setNewAvatar(false)
    } catch (err) {
      showToast(`❌ ${err.message}`)
    }
  }

  const handleProduceVideo = async (avatarId, topic) => {
    try {
      await produceVideoMutation.mutateAsync({ avatar_id: avatarId, topic })
      showToast(lang === 'HE' ? '🎬 הפקה החלה' : '🎬 Production started')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    }
  }

  const titles = {
    dashboard: t.nav.dashboard,
    avatars: openAvatar ? openAvatar.name : t.nav.avatars,
    videos: t.nav.videos,
    trends: t.nav.trends,
    analytics: t.nav.analytics,
    learnings: t.nav.learnings,
    settings: t.nav.settings,
  }

  // === Loading state ===
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontSize: 14,
      }}>
        Loading BotCraft...
      </div>
    )
  }

  // === Login screen ===
  if (!signedIn) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg)',
        padding: 20,
      }}>
        <div style={{
          maxWidth: 400,
          textAlign: 'center',
        }}>
          <h1 style={{ color: 'var(--text)', marginBottom: 16 }}>
            {t.loginTitle}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.6 }}>
            {t.loginSub}
          </p>
          <button
            onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--brand-gradient)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {t.google}
          </button>
        </div>
      </div>
    )
  }

  // === Main layout ===
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 64 : 240,
        flexShrink: 0,
        background: 'var(--surface)',
        borderInlineEnd: '1px solid var(--border)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms cubic-bezier(0.22,1,0.36,1)',
        position: 'sticky',
        top: 0,
      }}>
        {/* Logo */}
        <div style={{
          padding: '18px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--border)',
          height: 64,
          boxSizing: 'border-box',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--brand-gradient)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
          }}>
            BC
          </div>
          {!collapsed && <div style={{ fontWeight: 700, fontSize: 18 }}>BotCraft</div>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              marginInlineStart: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
            }}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Nav items */}
        <nav style={{
          flex: 1,
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          {['dashboard', 'avatars', 'videos', 'trends', 'analytics', 'learnings', 'settings'].map(
            (id) => {
              const isActive = page === id
              return (
                <button
                  key={id}
                  onClick={() => setPage(id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: collapsed ? '10px' : '10px 12px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    background: isActive ? 'var(--brand-gradient)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13.5,
                    fontWeight: 500,
                    boxShadow: isActive ? '0 4px 16px rgba(124,58,237,0.35)' : 'none',
                    transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  {!collapsed && <span>{t.nav[id]}</span>}
                </button>
              )
            }
          )}
        </nav>

        {/* Footer */}
        <div style={{
          padding: 12,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {!collapsed && (
            <button
              onClick={toggleLang}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 99,
                padding: '4px 5px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-muted)',
                alignSelf: 'flex-start',
              }}
            >
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 99,
                  background: lang === 'EN' ? 'var(--brand-gradient)' : 'transparent',
                  color: lang === 'EN' ? '#fff' : 'var(--text-muted)',
                }}
              >
                EN
              </span>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 99,
                  background: lang === 'HE' ? 'var(--brand-gradient)' : 'transparent',
                  color: lang === 'HE' ? '#fff' : 'var(--text-muted)',
                }}
              >
                HE
              </span>
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'linear-gradient(135deg,#A78BFA,#67E8F9)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#0A0A0F',
                fontSize: 13,
              }}
            >
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  You
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Pro plan</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          height: 64,
          boxSizing: 'border-box',
          background: 'var(--surface)',
          position: 'sticky',
          top: 0,
        }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
            {titles[page]}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="text"
              placeholder={t.search}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                width: 200,
              }}
            />
            <button
              onClick={() => setNewAvatar(true)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: 'var(--brand-gradient)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {t.newAvatar}
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {page === 'dashboard' && (
            <div>
              <h2 style={{ color: 'var(--text)', marginBottom: 24 }}>Dashboard</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 40 }}>
                {mockData.kpis.map((kpi, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: 18,
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                      {kpi.label}
                    </div>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: 8,
                      }}
                    >
                      {kpi.value}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--success)' }}>↑ {kpi.delta}</div>
                  </div>
                ))}
              </div>

              <h3 style={{ color: 'var(--text)', marginBottom: 16 }}>Recent Videos</h3>
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                overflow: 'hidden',
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>Title</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>Avatar</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>Status</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockData.videos.slice(0, 10).map(v => (
                      <tr
                        key={v.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setOpenVideo(v)}
                      >
                        <td style={{ padding: 12, color: 'var(--text)' }}>{v.title}</td>
                        <td style={{ padding: 12, color: 'var(--text-muted)' }}>{v.avatar}</td>
                        <td style={{ padding: 12 }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 500,
                            background: v.status === 'posted' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                            color: v.status === 'posted' ? 'var(--success)' : 'var(--warning)',
                          }}>
                            {v.status}
                          </span>
                        </td>
                        <td style={{ padding: 12, color: 'var(--text-muted)' }}>{v.created}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {page === 'avatars' && (
            <div>
              <h2 style={{ color: 'var(--text)', marginBottom: 24 }}>Avatars ({mockData.avatars.length})</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
                {mockData.avatars.map(a => (
                  <div
                    key={a.id}
                    onClick={() => setOpenAvatar(a)}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 200ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.2)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      background: a.grad,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 20,
                      marginBottom: 12,
                    }}>
                      {a.initial}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                      {a.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                      {a.niche}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
                      {a.videos} videos
                    </div>
                    <div style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 6,
                      display: 'inline-block',
                      background: a.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                      color: a.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
                    }}>
                      {a.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'videos' && (
            <div>
              <h2 style={{ color: 'var(--text)', marginBottom: 24 }}>Videos ({mockData.videos.length})</h2>
              <p style={{ color: 'var(--text-muted)' }}>Videos page content</p>
            </div>
          )}

          {['trends', 'analytics', 'learnings', 'settings'].includes(page) && (
            <div>
              <h2 style={{ color: 'var(--text)' }}>{titles[page]}</h2>
              <p style={{ color: 'var(--text-muted)' }}>Page content coming soon...</p>
            </div>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 80,
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--primary-glow)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-glow)',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--text)',
          animation: 'bcSlide 200ms cubic-bezier(0.22,1,0.36,1)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

export default BotCraftPage
