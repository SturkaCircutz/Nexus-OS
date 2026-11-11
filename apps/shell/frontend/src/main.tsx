import React from 'react'
import ReactDOM from 'react-dom/client'
import { Desktop } from './shell/Desktop'
import './theme/tokens.css'
import './ui/ui.css'
import './shell/shell.css'
import './shell/chrome/chrome.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Desktop />
  </React.StrictMode>,
)
