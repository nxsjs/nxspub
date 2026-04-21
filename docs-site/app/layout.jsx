import 'nextra-theme-docs/style.css'
import { LanguageGuard } from './components/language-guard'
import './global.css'

export const metadata = {
  title: {
    default: 'nxspub Docs',
    template: '%s - nxspub Docs',
  },
  description: 'Documentation for nxspub',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LanguageGuard />
        {children}
      </body>
    </html>
  )
}
