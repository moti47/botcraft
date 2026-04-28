import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('renders the assistant header and input', async () => {
    renderWithQuery(<ChatWidget />)
    await waitFor(() => {
      expect(screen.getByText(/AI Assistant/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/ask me|queue/i)).toBeInTheDocument()
    })
  })

  it('sends a message and shows the assistant reply', async () => {
    renderWithQuery(<ChatWidget />)
    const input = await screen.findByPlaceholderText(/ask me|queue/i)
    fireEvent.change(input, { target: { value: 'list avatars' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText(/hello back/i)).toBeInTheDocument()
    })
  })
})
