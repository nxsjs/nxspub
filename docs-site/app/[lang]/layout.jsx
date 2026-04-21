import { notFound } from 'next/navigation'
import { Layout, Navbar } from 'nextra-theme-docs'
import { getPageMap } from 'nextra/page-map'
import themeConfig from '../../theme.config'

const SUPPORTED_LOCALES = new Set(['en', 'zh'])

function prefixLocalizedHref(value, lang) {
  if (typeof value !== 'string') return value
  if (!value.startsWith('/')) return value
  if (value.startsWith('/_next') || value.startsWith('/api')) return value
  if (value === `/${lang}` || value.startsWith(`/${lang}/`)) return value
  if (
    value === '/en' ||
    value.startsWith('/en/') ||
    value === '/zh' ||
    value.startsWith('/zh/')
  ) {
    return value
  }
  if (value === '/') {
    return `/${lang}`
  }
  return `/${lang}${value}`
}

function localizePageMapRoutes(input, lang) {
  if (Array.isArray(input)) {
    return input.map(item => localizePageMapRoutes(item, lang))
  }
  if (!input || typeof input !== 'object') {
    return input
  }

  const output = { ...input }
  if ('route' in output) {
    output.route = prefixLocalizedHref(output.route, lang)
  }
  if ('href' in output) {
    output.href = prefixLocalizedHref(output.href, lang)
  }
  if ('children' in output) {
    output.children = localizePageMapRoutes(output.children, lang)
  }
  return output
}

export default async function DocsLocaleLayout({ children, params }) {
  const { lang } = await params
  if (!SUPPORTED_LOCALES.has(lang)) {
    notFound()
  }
  const pageMap = await getPageMap(`/${lang}`)
  const localizedPageMap = localizePageMapRoutes(pageMap, lang)

  return (
    <Layout
      navbar={
        <Navbar
          logo={themeConfig.logo}
          projectLink={themeConfig.project?.link}
        />
      }
      pageMap={localizedPageMap}
      docsRepositoryBase={themeConfig.docsRepositoryBase}
    >
      {children}
    </Layout>
  )
}
