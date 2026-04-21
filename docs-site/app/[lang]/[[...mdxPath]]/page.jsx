import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../../mdx-components'

const SUPPORTED_LOCALES = new Set(['en', 'zh'])

export const generateStaticParams = generateStaticParamsFor('mdxPath', 'lang')
const Wrapper = getMDXComponents().wrapper

function shouldIgnoreRoute(mdxPath) {
  if (!Array.isArray(mdxPath) || mdxPath.length === 0) return false
  const lastSegment = mdxPath[mdxPath.length - 1]
  return typeof lastSegment === 'string' && lastSegment.endsWith('.ico')
}

async function resolvePreferredLocale() {
  const requestCookies = await cookies()
  const cookieLocale = requestCookies.get('NEXT_LOCALE')?.value
  if (cookieLocale && SUPPORTED_LOCALES.has(cookieLocale)) {
    return cookieLocale
  }

  const requestHeaders = await headers()
  const acceptLanguage = (
    requestHeaders.get('accept-language') || ''
  ).toLowerCase()
  if (acceptLanguage.includes('zh')) {
    return 'zh'
  }
  return 'en'
}

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise
  if (
    !SUPPORTED_LOCALES.has(params.lang) ||
    shouldIgnoreRoute(params.mdxPath)
  ) {
    return {}
  }
  const { metadata } = await importPage(params.mdxPath, params.lang)
  return metadata
}

export default async function Page({ params: paramsPromise }) {
  const params = await paramsPromise
  if (shouldIgnoreRoute(params.mdxPath)) {
    notFound()
  }
  if (!SUPPORTED_LOCALES.has(params.lang)) {
    const preferredLocale = await resolvePreferredLocale()
    const normalizedTail = Array.isArray(params.mdxPath) ? params.mdxPath : []
    const normalizedPath = [params.lang, ...normalizedTail].join('/')
    redirect(`/${preferredLocale}/${normalizedPath}`)
  }
  const result = await importPage(params.mdxPath, params.lang)
  const { default: MDXContent, toc, metadata, sourceCode } = result

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent params={params} />
    </Wrapper>
  )
}
