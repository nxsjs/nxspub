'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

function readCookie(name) {
  if (typeof document === 'undefined') return undefined
  const encodedName = `${encodeURIComponent(name)}=`
  const cookiePart = document.cookie
    .split('; ')
    .find(item => item.startsWith(encodedName))
  if (!cookiePart) return undefined
  return decodeURIComponent(cookiePart.slice(encodedName.length))
}

function writeCookie(name, value, days = 36500) {
  if (typeof document === 'undefined') return

  const encodedName = encodeURIComponent(name)
  const encodedValue = encodeURIComponent(value)

  const date = new Date()
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)

  const expires = `; expires=${date.toUTCString()}`

  document.cookie = `${encodedName}=${encodedValue}${expires}; path=/; SameSite=Lax`
}

export function LanguageGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    const cookieLocale = readCookie('NEXT_LOCALE')
    let targetLocale =
      cookieLocale === 'zh' || cookieLocale === 'en' ? cookieLocale : undefined

    if (!targetLocale) {
      const isZhPreferred = navigator.languages.some(lang =>
        lang.toLowerCase().startsWith('zh'),
      )
      targetLocale = isZhPreferred ? 'zh' : 'en'
      writeCookie('NEXT_LOCALE', targetLocale)
    }
    if (pathname === '/' || pathname === '') return

    const isEnPath = pathname.startsWith('/en')
    const isZhPath = pathname.startsWith('/zh')

    if (targetLocale === 'zh' && isEnPath) {
      router.replace(pathname.replace('/en', '/zh'))
    } else if (targetLocale === 'en' && isZhPath) {
      router.replace(pathname.replace('/zh', '/en'))
    }
  }, [pathname, router])

  return null
}
