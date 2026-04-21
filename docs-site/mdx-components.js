import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'
import { PackageManagerTabs } from './app/components/package-manager-tabs'

const mdxComponents = getDocsMDXComponents()

export function useMDXComponents(components) {
  return {
    ...mdxComponents,
    PackageManagerTabs,
    ...components,
  }
}
