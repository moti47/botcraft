import * as React from 'react'

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 4000

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const listeners = []
let memoryState = { toasts: [] }

function dispatch(action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((l) => l(memoryState))
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_TOAST':
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.map((t) => (t.id === action.id || action.id === undefined ? { ...t, open: false } : t)) }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }
    default:
      return state
  }
}

export function toast({ title, description, variant = 'default', duration = TOAST_REMOVE_DELAY }) {
  const id = genId()
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', id })
  dispatch({
    type: 'ADD_TOAST',
    toast: {
      id,
      open: true,
      title,
      description,
      variant,
      onOpenChange: (open) => { if (!open) dismiss() },
    },
  })
  setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), duration)
  return { id, dismiss }
}

export function useToast() {
  const [state, setState] = React.useState(memoryState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const idx = listeners.indexOf(setState)
      if (idx > -1) listeners.splice(idx, 1)
    }
  }, [])
  return { ...state, toast, dismiss: (id) => dispatch({ type: 'DISMISS_TOAST', id }) }
}
