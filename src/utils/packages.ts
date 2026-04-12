import detectIndent from 'detect-indent'
import { promises as fs } from 'node:fs'

/**
 * @en Read and parse a JSON file.
 * @zh 异步读取并解析 JSON 文件。
 */
export async function readJSON(filepath: string) {
  return JSON.parse(await fs.readFile(filepath, 'utf-8'))
}

/**
 * @en Write a JSON file while preserving the original indentation style.
 * @zh 异步写入 JSON 文件，并自动保持原文件的缩进风格。
 */
export async function writeJSON(
  filepath: string,
  data: Record<string, unknown>,
) {
  const actualContent = await fs.readFile(filepath, 'utf-8')
  const fileIndent = detectIndent(actualContent).indent || '  '

  return await fs.writeFile(
    filepath,
    `${JSON.stringify(data, null, fileIndent)}\n`,
    'utf-8',
  )
}
