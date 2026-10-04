import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { extractFile } from '@electron/asar'
const executable =
  process.argv[2] ?? 'apps/desktop/release/mac-arm64/KafkaLens.app/Contents/MacOS/KafkaLens'
if (process.platform !== 'darwin' || !existsSync(executable))
  throw new Error('Build a macOS preview first, or pass its executable path.')
const asar = path.join(path.dirname(executable), '../Resources/app.asar')
const packagedMain = extractFile(asar, 'out/main/index.js').toString()
if (
  !packagedMain.includes(
    'if (process.env.KAFKALENS_TEST_DATA) electron.app.setPath("userData", process.env.KAFKALENS_TEST_DATA);'
  ) ||
  !packagedMain.includes('return process.env.KAFKALENS_TEST_DATA ? "com.kafkalens.test."')
)
  throw new Error(
    'This build does not support isolated packaged profiling. Rebuild before profiling.'
  )
const data = mkdtempSync(path.join(tmpdir(), 'kafkalens-memory-'))
const db = new Database(path.join(data, 'kafkalens.db'))
db.exec(
  `CREATE TABLE clusters (id TEXT PRIMARY KEY,name TEXT,bootstrap_servers TEXT,auth_method TEXT,ssl INTEGER,ssl_reject_unauthorized INTEGER,username TEXT,password TEXT,ssl_cert_path TEXT,schema_registry_url TEXT,schema_registry_username TEXT,schema_registry_password TEXT,environment_label TEXT,color_tag TEXT,created_at INTEGER,updated_at INTEGER,extra_json TEXT,has_credentials INTEGER)`
)
db.prepare('INSERT INTO clusters VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
  'memory-fixture',
  'Memory fixture',
  '127.0.0.1:19092',
  'none',
  0,
  1,
  null,
  null,
  null,
  null,
  null,
  null,
  'local',
  '#6366f1',
  Date.now(),
  Date.now(),
  '{}',
  0
)
db.close()
const env = { ...process.env, KAFKALENS_TEST_DATA: data }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(executable, [], { env, stdio: 'ignore' })
try {
  await new Promise((resolve, reject) => {
    child.once('error', reject)
    setTimeout(resolve, 12000)
  })
  if (child.exitCode !== null) throw new Error(`App exited during measurement (${child.exitCode})`)
  const all = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((row) => {
      const match = row.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)
      return match
        ? {
            pid: Number(match[1]),
            parent: Number(match[2]),
            rssKB: Number(match[3]),
            process: match[4]
          }
        : null
    })
    .filter(Boolean)
  const descendants = new Set([child.pid])
  let added = true
  while (added) {
    added = false
    for (const p of all)
      if (descendants.has(p.parent) && !descendants.has(p.pid)) {
        descendants.add(p.pid)
        added = true
      }
  }
  const processes = all.filter((p) => descendants.has(p.pid))
  const result = {
    profile: 'isolated, one local Kafka cluster, dashboard idle for 12 seconds, no debugger',
    totalRssMiB: processes.reduce((n, p) => n + p.rssKB, 0) / 1024,
    processes,
    note: 'RSS summed across Electron processes includes shared pages. The PRD target is 150 MB.'
  }
  mkdirSync('output', { recursive: true })
  writeFileSync('output/packaged-memory.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000))
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
  rmSync(data, { recursive: true, force: true })
}
