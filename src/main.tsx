import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { startGame } from './bootstrap'
import './ui/kit/tokens.css'
import './ui/kit/base.css'

startGame()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
