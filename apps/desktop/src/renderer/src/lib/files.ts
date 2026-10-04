export function download(name: string, value: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([value], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function csv(rows: unknown[][] | string[], data?: unknown[][]): string {
  const all = data ? [rows, ...data] : (rows as unknown[][])
  return all
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(v ?? '')
              .replace(/^[=+@-]/, "'$&")
              .replace(/"/g, '""') +
            '"'
        )
        .join(',')
    )
    .join('\n')
}
export function exportCluster(config: import('@/types').ClusterConfig): Record<string, unknown> {
  const {
    password: _password,
    username: _username,
    schemaRegistryAuth: _registry,
    ...publicConfig
  } = config
  return publicConfig
}
