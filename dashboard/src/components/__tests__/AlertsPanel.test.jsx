import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/helpers'

vi.mock('@/lib/api', () => ({
  API_URL: 'http://test',
  endpoints: {
    notificationsList: vi.fn(() => Promise.resolve({ data: [
      { id: 'n1', title: 'Pipeline failed', message: 'lipsync stage error', level: 'error', is_read: false, created_at: '2026-01-01T00:00:00Z' },
      { id: 'n2', title: 'Quota warning', message: 'gemini at 80%', level: 'warning', is_read: false, created_at: '2026-01-01T00:00:00Z' },
    ]})),
    notificationsUnreadCount: vi.fn(() => Promise.resolve({ data: { count: 2 }})),
  },
}))

import { AlertsPanel } from '../../pages/Overview'

describe('AlertsPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows error and warning notifications', async () => {
    renderWithQuery(<AlertsPanel />)
    await waitFor(() => {
      expect(screen.getByText(/pipeline failed/i)).toBeInTheDocument()
      expect(screen.getByText(/quota warning/i)).toBeInTheDocument()
    })
  })
})
