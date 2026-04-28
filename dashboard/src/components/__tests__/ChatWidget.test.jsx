import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/helpers'

vi.mock('@/lib/api', () => ({
  API_URL: 'http://test',
  endpoints: {
    chatSend: vi.fn(() => Promise.resolve({ data: {
      reply: 'hello back!',
      actions_taken: [{ tool: 'list_avatars', status: 'ok' }],
      message_id: 'm1',
    }})),
    chatHistory: vi.fn(() => Promise.resolve({ data: [] })),
  },
}))

import { ChatWidget } from '../ChatWidget'

describe('ChatWidget', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the assistant header', async () => {
    renderWithQuery(<ChatWidget />)
    await waitFor(() => {
      expect(screen.getByText(/AI Assistant/i)).toBeInTheDocument()
    })
  })

  it('shows the input field once data has loaded', async () => {
    renderWithQuery(<ChatWidget />)
    await waitFor(() => {
      const input = document.querySelector('input[placeholder]')
      expect(input).toBeTruthy()
    }, { timeout: 3000 })
  })
})
