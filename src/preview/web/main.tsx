import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './src/App'
import './src/styles/tokens.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Missing root container.')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
