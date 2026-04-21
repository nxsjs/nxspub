import { defineConfig } from 'nxspub'

export default defineConfig({
  scripts: {
    beforeVersionCommit: 'pnpm run changelog',
  },
})
