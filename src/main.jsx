import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initNativeShell } from '@/lib/native'

// No-op on the web; in the iOS shell sets the status bar and tags <html>
// with .native so CSS can pad for it.
initNativeShell()

// A deploy can replace the files an open tab expects; a page then fails to
// load one of its parts. Reload once to pick up the current build instead of
// leaving a blank screen (guarded so a real outage can't loop).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('doorman_chunk_reload') || 0)
    if (Date.now() - last < 30000) return
    sessionStorage.setItem('doorman_chunk_reload', String(Date.now()))
  } catch { /* storage unavailable: still try once */ }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
