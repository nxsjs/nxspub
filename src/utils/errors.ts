import { cliLogger } from './logger'

export class NxspubError extends Error {
  exitCode: number
  silent: boolean

  constructor(
    message: string = '',
    exitCode: number = 1,
    options?: { silent?: boolean },
  ) {
    super(message)
    this.name = 'NxspubError'
    this.exitCode = exitCode
    this.silent = options?.silent ?? true
  }
}

/**
 * @en Abort command execution by throwing a silent NxspubError.
 * @zh 通过抛出静默的 NxspubError 中断命令执行。
 *
 * @param exitCode
 * @en Process exit code used by CLI handler.
 * @zh CLI 处理器使用的进程退出码。
 *
 * @returns
 * @en Never returns.
 * @zh 不会返回。
 */
export function abort(exitCode: number = 1): never {
  throw new NxspubError('', exitCode, { silent: true })
}

/**
 * @en Normalize unknown errors into readable message text.
 * @zh 将未知错误规范化为可读的错误文本。
 *
 * @param error
 * @en Unknown thrown value.
 * @zh 未知的抛出值。
 *
 * @returns
 * @en Normalized error message.
 * @zh 规范化后的错误消息。
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/**
 * @en Handle top-level CLI errors and terminate process with proper exit code.
 * @zh 处理 CLI 顶层错误并使用正确退出码结束进程。
 *
 * @param error
 * @en Unknown error value from command execution.
 * @zh 命令执行过程中捕获的未知错误值。
 *
 * @returns
 * @en Never returns.
 * @zh 不会返回。
 */
export function handleCliError(error: unknown): never {
  if (error instanceof NxspubError) {
    if (!error.silent && error.message) {
      cliLogger.error(error.message)
    }
    process.exit(error.exitCode)
  }

  cliLogger.error(toErrorMessage(error))
  process.exit(1)
}
