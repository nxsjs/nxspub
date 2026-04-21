const config = {
  i18n: [
    { locale: 'en', name: 'English' },
    { locale: 'zh', name: '中文' },
  ],
  logo: (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      <img src="/logo.svg" alt="nxspub" width="22" height="22" />
      <span style={{ fontWeight: 900, letterSpacing: '-0.04em' }}>NXSPUB</span>
    </span>
  ),
  project: {
    link: 'https://github.com/nxsjs/nxspub',
  },
  docsRepositoryBase:
    'https://github.com/nxsjs/nxspub/tree/main/docs-site/content',
  footer: {
    text: `MIT ${new Date().getFullYear()} © nxspub`,
  },
  primaryHue: 82,
  primarySaturation: 100,
}

export default config
