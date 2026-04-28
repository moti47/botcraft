import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// jsdom doesn't implement matchMedia / EventSource — stub them
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    })
  }
  if (!window.EventSource) {
    window.EventSource = class {
      constructor() { this.readyState = 0 }
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
  }
}
