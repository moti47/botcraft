import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQuery } from '@/test/helpers'

vi.mock('@/lib/api', () => ({
  API_URL: 'http://test',
  endpoints: {
    avatarsList: vi.fn(() => Promise.resolve({ data: [] })),
    schedulerStatus: vi.fn(() => Promise.resolve({ data: { running: true, total_jobs: 0, by_avatar: {} }})),
  },
}))

import { WeeklyCalendar } from '../../pages/Overview'

describe('WeeklyCalendar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders all 7 day-of-week labels', () => {
    const avatars = [
      {
        id: 'a1',
        name: 'Alice',
        commands: [{ schedule_cron: '0 9 * * *', video_type: 'short', is_active: true }],
      },
    ]
    renderWithQuery(<WeeklyCalendar avatars={avatars} />)
    // The component renders English short day labels: Sun..Sat
    for (const d of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(screen.getByText(d)).toBeInTheDocument()
    }
  })
})
