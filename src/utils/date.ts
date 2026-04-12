/**
 * @en Format a date object to a YYYY-MM-DD string.
 * @zh 将日期对象格式化为 YYYY-MM-DD 字符串。
 *
 * @param d
 * @en Date object (defaults to current date)
 * @zh 日期对象（默认为当前日期）
 *
 * @returns
 * @en Formatted date string (e.g., '2026-04-12')
 * @zh 格式化后的日期字符串（例如 '2026-04-12'）
 */
export const formatDate = (d = new Date()) => d.toISOString().split('T')[0]
