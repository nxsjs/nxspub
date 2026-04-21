'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function LanguageGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const browserLang = navigator.language.toLowerCase()
    const targetLocale = browserLang.includes('zh') ? 'zh' : 'en'

    if (pathname === '/' || pathname === '') {
      router.replace(`/${targetLocale}`)
      return
    }

    const isEnPath = pathname.startsWith('/en')
    const isZhPath = pathname.startsWith('/zh')

    if (targetLocale === 'zh' && isEnPath) {
      const newPath = pathname.replace('/en', '/zh')
      router.replace(newPath)
    } else if (targetLocale === 'en' && isZhPath) {
      const newPath = pathname.replace('/zh', '/en')
      router.replace(newPath)
    }
  }, [pathname, router])

  return null
}
