import { app } from 'electron'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

// Send secrets through stdin; never place them in process arguments or logs.
const quote = (value: string): string =>
  '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
export class CredentialService {
  private service(): string {
    return process.env.KAFKALENS_TEST_DATA
      ? 'com.kafkalens.test.' +
          createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0, 12)
      : 'com.kafkalens.credentials'
  }
  private cache = new Map<string, Record<string, string>>()
  get(account: string): Record<string, string> {
    const cached = this.cache.get(account)
    if (cached) return { ...cached }
    if (process.platform !== 'darwin')
      throw new Error('Secure credential storage requires macOS Keychain.')
    try {
      const value = execFileSync(
        '/usr/bin/security',
        ['find-generic-password', '-s', this.service(), '-a', account, '-w'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      )
      const credentials = JSON.parse(value) as Record<string, string>
      this.cache.set(account, credentials)
      return { ...credentials }
    } catch (error) {
      if ((error as { status?: number }).status === 44) return {}
      throw new Error('Could not read credentials. Unlock your macOS login Keychain and try again.')
    }
  }
  set(account: string, credentials: Record<string, string>): void {
    if (process.platform !== 'darwin')
      throw new Error('Secure credential storage requires macOS Keychain.')
    try {
      execFileSync('/usr/bin/security', ['-i'], {
        input: `add-generic-password -U -s ${this.service()} -a ${quote(account)} -w ${quote(JSON.stringify(credentials))}\n`,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      // Interactive security reports failures in its output, sometimes with exit 0.
      this.cache.delete(account)
      const stored = this.get(account)
      if (JSON.stringify(stored) !== JSON.stringify(credentials))
        throw new Error('Keychain write did not persist')
    } catch {
      throw new Error('Could not save credentials. Unlock your macOS login Keychain and try again.')
    }
  }
  delete(account: string): void {
    try {
      execFileSync(
        '/usr/bin/security',
        ['delete-generic-password', '-s', this.service(), '-a', account],
        { stdio: 'pipe' }
      )
    } catch (error) {
      if ((error as { status?: number }).status !== 44)
        throw new Error('Could not remove Keychain credentials.')
    }
    this.cache.delete(account)
  }
}
export const credentialService = new CredentialService()
