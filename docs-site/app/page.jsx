'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    const browserLang = navigator.language.toLowerCase()
    const targetLocale = browserLang.includes('zh') ? '/zh' : '/en'
    router.replace(targetLocale)
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-white font-black uppercase tracking-tighter text-black">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-pulse text-2xl">Redirecting...</div>
        <a
          href="/en"
          className="border-2 border-black px-4 py-1 text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
        >
          Click here if not redirected
        </a>
      </div>
    </div>
  )
}
