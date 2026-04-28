import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/helpers'

vi.mock('@/lib/api', () => ({
  API_URL: 'http://test',
  endpoints: {
    notificationsList: vi.fn(() => Promise.resolve({ data: [
      { id: '1', title: 'Test alert', message: 'hello', level: 'error', is_read: false, created_at: '2026-01-01T00:00:00Z' },
    ]})),
    notificationsUnreadCount: vi.fn(() => Promise.resolve({ data: { count: 1 }})),
    notificationMarkRead: vi.fn(() => Promise.resolve({ data: {} })),
    notificationMarkAllRead: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import { TopBar } from '../layout/TopBar'

describe('NotificationBell (in TopBar)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the bell with unread badge', async () => {
    renderWithQuery(<TopBar />)
    await waitFor(() => {
      // The badge shows the unread count
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })
})
