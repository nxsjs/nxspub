/**
 * @en Convert a string or string array into RegExp object(s).
 * Supports literal strings and slash-wrapped strings with flags (e.g., "/^feat:/i").
 * @zh 将字符串或字符串数组转换为正则表达式对象。
 * 支持普通字符串和带修饰符的斜杠字符串（例如 "/^feat:/i"）。
 */
export function normalizeRegExp(pattern: string | RegExp): RegExp
export function normalizeRegExp(patterns: (string | RegExp)[]): RegExp[]
export function normalizeRegExp(
  input: string | RegExp | (string | RegExp)[],
): RegExp | RegExp[] {
  const normalize = (p: string | RegExp): RegExp => {
    if (p instanceof RegExp) return p

    const match = p.match(/^\/(.+)\/([gimsuy]*)$/)

    if (match) {
      const [, pattern, flags] = match
      return new RegExp(pattern, flags)
    }

    return new RegExp(p)
  }

  if (Array.isArray(input)) {
    return input.map(normalize)
  }

  return normalize(input)
}
