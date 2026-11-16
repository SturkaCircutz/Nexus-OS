import React from 'react'
import ReactDOM from 'react-dom/client'
import { Desktop } from './shell/Desktop'

// Fonts are self-hosted (local-first, air-gapped): no network @imports anywhere.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'

// The UI library's layers, in order.
import './ui/tokens/tokens.css'
import './ui/ascii/ascii.css'
import './ui/components/components.css'
import './ui/overlays/overlays.css'
import './ui/ai/ai.css'
import './ui/media/media.css'
import './ui/templates/templates.css'

// The shell.
import './shell/shell.css'
import './shell/chrome/chrome.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Desktop />
  </React.StrictMode>,
)
