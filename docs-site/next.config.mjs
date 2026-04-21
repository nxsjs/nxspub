import nextra from 'nextra'

const withNextra = nextra({
  search: {
    codeblocks: false,
  },
})

export default withNextra({
  output: 'export',
  i18n: {
    locales: ['en', 'zh'],
    defaultLocale: 'en',
    localeDetection: true,
  },
})
