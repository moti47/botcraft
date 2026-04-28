import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/helpers'

vi.mock('@/lib/api', () => ({
  API_URL: 'http://test',
  endpoints: {
    avatarsList: vi.fn(() => Promise.resolve({ data: [
      { id: 'a1', name: 'Alice', commands: [
        { schedule_cron: '0 9 * * *', video_type: 'short', is_active: true },
      ]},
    ]})),
    schedulerStatus: vi.fn(() => Promise.resolve({ data: { running: true, total_jobs: 1, by_avatar: {} }})),
  },
}))

// WeeklyCalendar lives inside Overview — import it via Overview default export if present,
// else import the component from where it's defined.
import { WeeklyCalendar } from '../../pages/Overview'

describe('WeeklyCalendar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 7 day columns', async () => {
    renderWithQuery(<WeeklyCalendar />)
    await waitFor(() => {
      // Day labels could be Sun..Sat or א..ש; assert at least 7 column headers
      const headings = screen.getAllByRole('columnheader', { hidden: true }).length
        || screen.getAllByText(/sun|mon|tue|wed|thu|fri|sat|א|ב|ג|ד|ה|ו|ש/i).length
      expect(headings).toBeGreaterThanOrEqual(7)
    })
  })
})
