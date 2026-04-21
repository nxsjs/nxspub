import { afterEach, describe, expect, it } from 'vitest'
import { createDeployProviderAdapter } from '../src/deploy/providers'

afterEach(() => {
  delete process.env.VERCEL_TOKEN
  delete process.env.CLOUDFLARE_API_TOKEN
  delete process.env.ONEPANEL_API_KEY
  delete process.env.BT_API_KEY
  delete process.env.RANCHER_TOKEN
})

describe('deploy providers', () => {
  it('validates required env for vercel provider', async () => {
    const provider = createDeployProviderAdapter('vercel', {})
    await expect(provider.validate({})).rejects.toMatchObject({
      name: 'NxspubError',
      exitCode: 2,
    })

    process.env.VERCEL_TOKEN = 'token'
    await expect(provider.validate({})).resolves.toBeUndefined()
  })

  it('requires baseUrl and api key env for onepanel provider', async () => {
    const provider = createDeployProviderAdapter('onepanel', {})
    await expect(provider.validate({})).rejects.toMatchObject({
      name: 'NxspubError',
      exitCode: 2,
    })

    const provider2 = createDeployProviderAdapter('onepanel', {
      baseUrl: 'https://panel.example.com',
      apiKeyEnv: 'ONEPANEL_API_KEY',
    })
    process.env.ONEPANEL_API_KEY = 'key'
    await expect(provider2.validate({})).resolves.toBeUndefined()
  })

  it('requires credential source for ssh provider', async () => {
    const provider = createDeployProviderAdapter('ssh', {})
    await expect(provider.validate({})).rejects.toMatchObject({
      name: 'NxspubError',
      exitCode: 2,
    })

    const provider2 = createDeployProviderAdapter('ssh', {
      privateKeyPath: '~/.ssh/id_ed25519',
    })
    await expect(provider2.validate({})).resolves.toBeUndefined()
  })
})
