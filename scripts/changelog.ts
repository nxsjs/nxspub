import fs from 'node:fs/promises'
import path from 'node:path'

const CHANGELOG_DOC_DIR = 'changelog'
const RELEASES_FILE = 'releases.md'
const ARCHIVES_DIR = 'changelogs'

async function pathExists(filePath: string): Promise<boolean> {
  return await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false)
}

function toArchiveTitle(fileName: string): string {
  return fileName.replace(/\.md$/i, '')
}

function toMarkdownPage(title: string, markdownBody: string): string {
  return `---\ntitle: ${title}\n---\n\n${markdownBody.trim()}\n`
}

async function ensureSectionScaffold(
  localeDir: string,
  locale: 'en' | 'zh',
): Promise<void> {
  const sectionDir = path.join(localeDir, CHANGELOG_DOC_DIR)
  const archiveDir = path.join(sectionDir, ARCHIVES_DIR)
  await fs.mkdir(archiveDir, { recursive: true })

  const indexTitle = locale === 'en' ? 'Release Notes' : '发布日志'
  const releasesLabel = locale === 'en' ? 'Latest Changelog' : '最新 Changelog'
  const archivesLabel =
    locale === 'en' ? 'Archive Changelogs' : '历史 Changelog'
  const indexFilePath = path.join(sectionDir, 'index.mdx')
  const metaPath = path.join(sectionDir, '_meta.js')

  if (!(await pathExists(indexFilePath))) {
    const content =
      `---\ntitle: ${indexTitle}\n---\n\n` +
      `# ${indexTitle}\n\n` +
      `- [${releasesLabel}](./releases)\n` +
      `- [${archivesLabel}](./changelogs)\n`
    await fs.writeFile(indexFilePath, content, 'utf-8')
  }

  if (!(await pathExists(metaPath))) {
    const releasesText = locale === 'en' ? 'Latest Changelog' : '最新 Changelog'
    const archivesText =
      locale === 'en' ? 'Archive Changelogs' : '历史 Changelog'
    const metaContent =
      `export default {\n` +
      `  index: '${indexTitle}',\n` +
      `  releases: '${releasesText}',\n` +
      `  changelogs: '${archivesText}',\n` +
      `}\n`
    await fs.writeFile(metaPath, metaContent, 'utf-8')
  }
}

async function writeArchiveMeta(
  targetArchiveDir: string,
  locale: 'en' | 'zh',
): Promise<void> {
  const files = (await fs.readdir(targetArchiveDir))
    .filter(file => file.endsWith('.md'))
    .sort((left, right) => right.localeCompare(left))
  const indexTitle = locale === 'en' ? 'Archive Changelogs' : '历史 Changelog'
  const rows = files.map(
    file => `  '${file.replace(/\.md$/, '')}': '${toArchiveTitle(file)}',`,
  )
  const content = `export default {\n  index: '${indexTitle}',\n${rows.join('\n')}\n}\n`
  await fs.writeFile(path.join(targetArchiveDir, '_meta.js'), content, 'utf-8')
}

async function writeArchiveIndexPage(
  targetArchiveDir: string,
  locale: 'en' | 'zh',
): Promise<void> {
  const title = locale === 'en' ? 'Archive Changelogs' : '历史 Changelog'
  const body =
    locale === 'en'
      ? 'Archived changelog files generated from repository `/changelogs`.'
      : '来自仓库 `/changelogs` 的归档 changelog 文件。'
  const content = `---\ntitle: ${title}\n---\n\n# ${title}\n\n${body}\n`
  await fs.writeFile(path.join(targetArchiveDir, 'index.mdx'), content, 'utf-8')
}

async function syncLocaleChangelogDocs(
  docsSiteContentDir: string,
  sourceChangelogPath: string,
  sourceArchiveDir: string,
  locale: 'en' | 'zh',
): Promise<void> {
  const localeDir = path.join(docsSiteContentDir, locale)
  if (!(await pathExists(localeDir))) return

  await ensureSectionScaffold(localeDir, locale)

  const sectionDir = path.join(localeDir, CHANGELOG_DOC_DIR)
  const targetReleasesPath = path.join(sectionDir, RELEASES_FILE)
  const targetArchiveDir = path.join(sectionDir, ARCHIVES_DIR)

  const releasesTitle = locale === 'en' ? 'Latest Changelog' : '最新 Changelog'
  const changelogContent = await fs.readFile(sourceChangelogPath, 'utf-8')
  await fs.writeFile(
    targetReleasesPath,
    toMarkdownPage(releasesTitle, changelogContent),
    'utf-8',
  )

  await fs.rm(targetArchiveDir, { recursive: true, force: true })
  await fs.mkdir(targetArchiveDir, { recursive: true })

  if (await pathExists(sourceArchiveDir)) {
    const files = (await fs.readdir(sourceArchiveDir))
      .filter(file => file.endsWith('.md'))
      .sort((left, right) => right.localeCompare(left))
    for (const fileName of files) {
      const sourceFilePath = path.join(sourceArchiveDir, fileName)
      const content = await fs.readFile(sourceFilePath, 'utf-8')
      const fileTitle = toArchiveTitle(fileName)
      const targetFilePath = path.join(targetArchiveDir, fileName)
      await fs.writeFile(
        targetFilePath,
        toMarkdownPage(fileTitle, content),
        'utf-8',
      )
    }
  }

  await writeArchiveIndexPage(targetArchiveDir, locale)
  await writeArchiveMeta(targetArchiveDir, locale)
}

/**
 * @en Sync root changelog artifacts into docs-site pages.
 * @zh 将根目录 changelog 产物同步到 docs-site 页面。
 *
 * @param cwd
 * @en Workspace root path.
 * @zh 工作区根目录路径。
 */
export async function syncChangelogToDocsSite(cwd: string): Promise<void> {
  const docsSiteContentDir = path.join(cwd, 'docs-site', 'content')
  const sourceChangelogPath = path.join(cwd, 'CHANGELOG.md')
  const sourceArchiveDir = path.join(cwd, 'changelogs')

  if (!(await pathExists(docsSiteContentDir))) return
  if (!(await pathExists(sourceChangelogPath))) return

  await syncLocaleChangelogDocs(
    docsSiteContentDir,
    sourceChangelogPath,
    sourceArchiveDir,
    'en',
  )
  await syncLocaleChangelogDocs(
    docsSiteContentDir,
    sourceChangelogPath,
    sourceArchiveDir,
    'zh',
  )
}

syncChangelogToDocsSite(process.cwd())
