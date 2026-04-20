import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './src/App'
import { createTranslator, detectBrowserLocale } from './src/i18n'
import './src/styles/tokens.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error(createTranslator(detectBrowserLocale())('errMissingRoot'))
}

const locale = detectBrowserLocale()
document.documentElement.lang = locale

createRoot(rootElement).render(
  <React.StrictMode>
    <App locale={locale} />
  </React.StrictMode>,
)
