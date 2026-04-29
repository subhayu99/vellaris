import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('<App />', () => {
  it('renders the marketing landing at "/"', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    // Marketing is lazy-loaded; await the first chrome element to confirm it mounted.
    expect(
      await screen.findByRole('heading', { name: /files only the people you choose can read/i }),
    ).toBeInTheDocument()
  })

  it('"/app" routes into the connect entry point', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /connect to your server/i })).toBeInTheDocument()
  })

  it('an unknown path falls back to the marketing landing', async () => {
    render(
      <MemoryRouter initialEntries={['/some-bogus-path']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { name: /files only the people you choose can read/i }),
    ).toBeInTheDocument()
  })
})
