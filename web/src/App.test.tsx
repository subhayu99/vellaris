import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('<App />', () => {
  it('redirects "/" to the connect screen', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /connect to a vellaris server/i })).toBeVisible()
  })
})
