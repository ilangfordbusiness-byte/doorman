import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initNativeShell } from '@/lib/native'

// No-op on the web; in the iOS shell sets the status bar and tags <html>
// with .native so CSS can pad for it.
initNativeShell()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
