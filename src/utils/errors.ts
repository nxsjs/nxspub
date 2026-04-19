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

export function abort(exitCode: number = 1): never {
  throw new NxspubError('', exitCode, { silent: true })
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

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
