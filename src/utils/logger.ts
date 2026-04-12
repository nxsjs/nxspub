/* eslint-disable no-console */
import chalk from 'chalk'
import pkg from '../../package.json'

const PRIMARY_HEX = '#CCFF00'
const brand = chalk.hex(PRIMARY_HEX)
const bgBrand = chalk.bgHex(PRIMARY_HEX).black.bold

/**
 * @en Main logging utility for nxspub.
 * @zh nxspub 的主要日志工具。
 */
export const nxsLog = {
  /**
   * @en Print a major step header with solid background.
   * @zh 打印带有实色背景的主步骤标题。
   */
  step: (msg: string) => {
    const text = `  ${msg.toUpperCase()}  `
    console.log(`\n${bgBrand(text)}`)
    console.log(chalk.black('▀'.repeat(text.length)))
  },

  /**
   * @en Print a success message with a square bullet.
   * @zh 打印带有方块符号的成功信息。
   */
  success: (msg: string) => {
    console.log(`${brand('■')} ${chalk.bold(msg)}`)
  },

  /**
   * @en Print a warning alert with yellow background.
   * @zh 打印带有黄色背景的警告提示。
   */
  warn: (msg: string) => {
    const text = `  ! ${msg.toUpperCase()}  `
    console.log(`\n${chalk.bgHex('#FFCC00').black.bold(text)}`)
    console.log(chalk.black('▀'.repeat(text.length)))
  },

  /**
   * @en Print an error alert with red background.
   * @zh 打印带有红色背景的错误提示。
   */
  error: (msg: string) => {
    const text = `  ✘ ERROR: ${msg.toUpperCase()}  `
    console.log(`\n${chalk.bgRed.white.bold(text)}`)
    console.log(chalk.black('▀'.repeat(text.length)))
  },

  /**
   * @en Highlight key information using brand color.
   * @zh 使用品牌色高亮关键信息。
   */
  highlight: (msg: string | number) => brand.bold(msg),

  /**
   * @en Print gray-scaled text.
   * @zh 打印灰色文字。
   */
  dim: (msg: string) => console.log(chalk.gray(msg)),

  /**
   * @en Print a sub-item line with an arrow.
   * @zh 打印带箭头的子项列表。
   */
  item: (msg: string) => console.log(`  ${brand('↳')} ${chalk.gray(msg)}`),

  /**
   * @en Print a thin horizontal divider.
   * @zh 打印细横线分割符。
   */
  divider: (length = 40) => {
    console.log(chalk.gray('╶'.repeat(length)))
  },

  /**
   * @en Raw console.log proxy.
   * @zh 标准控制台日志输出。
   */
  log: (...args: any[]) => {
    console.log(...args)
  },
}

/**
 * @en Prints the Neubrutalism style CLI banner.
 * @zh 打印新粗犷主义风格的 CLI 横幅。
 */
export const printBanner = () => {
  const name =
    '                              N X S P U B                              '
  const version = pkg.version
  const url = 'https://nxsjs.com '

  console.log('\n')

  const bannerLine = bgBrand(name)

  console.log(bannerLine)

  console.log(chalk.black('▀'.repeat(name.length)))

  nxsLog.item(`⚡Version: ${version}`)
  nxsLog.item(
    '⚡Website: ' +
      chalk.underline(
        `\u001b]8;;https://nxsjs.com\u0007${url}\u001b]8;;\u0007`,
      ),
  )
  nxsLog.divider(name.length)

  console.log('')
}

/**
 * @en Visualize version transition.
 * @zh 可视化版本变更。
 */
export const printVersionDiff = (current: string, next: string) => {
  console.log(
    `  ${chalk.gray(current)} ${chalk.bold('→')} ${brand.bold(next)}\n`,
  )
}

/**
 * @en Print footer credits.
 * @zh 打印页脚版权信息。
 */
export const footer = () => {
  console.log(
    `\n${brand('■')} ${chalk.bold('NXS')} ${chalk.gray('by Nyx Sola')}\n`,
  )
}
