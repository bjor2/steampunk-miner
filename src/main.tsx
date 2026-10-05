import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { startGame } from './bootstrap'
import './ui/kit/tokens.css'
import './ui/kit/base.css'

// The scene starts ticking once mounted, so it mounts after the session is resumed or fresh.
function renderGame(): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void startGame().then(renderGame)
