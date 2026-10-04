import { performance } from 'node:perf_hooks'
import { extractFile } from '@electron/asar'
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
if (process.env.KAFKALENS_EXECUTABLE) {
  const code = extractFile(
    path.join(path.dirname(process.env.KAFKALENS_EXECUTABLE), '../Resources/app.asar'),
    'out/main/index.js'
  ).toString()
  assert(
    code.includes(
      'if (process.env.KAFKALENS_TEST_DATA) electron.app.setPath("userData", process.env.KAFKALENS_TEST_DATA);'
    )
  )
  assert(code.includes('return process.env.KAFKALENS_TEST_DATA ? "com.kafkalens.test."'))
}
const data = mkdtempSync(path.join(tmpdir(), 'kafkalens-desktop-'))
const service = 'com.kafkalens.test.' + createHash('sha256').update(data).digest('hex').slice(0, 12)
const id = 'desktop-' + Date.now()
const topic = id + '-orders'
const dlq = topic + '.DLT'
const group = id + '-consumer'
const subject = id + '-value'
const offline = process.argv.includes('--offline')
const errors = []
const measurements = {}
let app
const env = { ...process.env, KAFKALENS_TEST_DATA: data }
delete env.ELECTRON_RUN_AS_NODE
async function start() {
  const started = performance.now()
  app = await electron.launch({
    executablePath: process.env.KAFKALENS_EXECUTABLE,
    args: process.env.KAFKALENS_EXECUTABLE ? [] : ['apps/desktop'],
    env,
    timeout: 30000
  })
  app.context().setDefaultTimeout(15000)
  const window = await app.firstWindow()
  window.on('pageerror', (e) => errors.push(e.message))
  await window.getByRole('button', { name: 'Settings', exact: true }).waitFor()
  const elapsed = performance.now() - started
  if (measurements.launchMs === undefined) measurements.launchMs = elapsed
  else measurements.restartMs = elapsed
  return window
}
async function result(page, method, args) {
  const response = await page.evaluate(
    async ({ method, args }) => {
      const [group, name] = method.split('.')
      return window.api[group][name](...args)
    },
    { method, args }
  )
  assert.equal(response.success, true, response.error)
  return response.data
}
try {
  let page = await start()
  console.log('Desktop started')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  const config = {
    id,
    name: 'Desktop fixture',
    bootstrapServers: '127.0.0.1:19092',
    authMethod: 'none',
    environmentLabel: 'prod',
    colorTag: '#6366f1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    username: 'fixture-user',
    password: 'fixture-private',
    schemaRegistryUrl: 'http://127.0.0.1:18081',
    schemaRegistryAuth: { username: 'registry-fixture', password: 'fixture-registry' }
  }
  await result(page, 'cluster.save', [config])
  assert.equal((await result(page, 'cluster.list', []))[0].password, 'fixture-private')
  await result(page, 'settings.saveAI', [
    {
      enabled: false,
      provider: 'google',
      model: 'gemini-test',
      apiKey: 'fixture-ai',
      redactedFields: ['password'],
      historyEnabled: true,
      consent: false
    }
  ])
  // Delay one section independently to reproduce a slow remote dashboard.
  // These handlers exist only in the first isolated process; restart restores
  // the real services for the Kafka checks below.
  await app.evaluate(
    ({ app, ipcMain }, { topic, group }) => {
      const regression = { calls: 0, release: null }
      app.dashboardRegression = regression
      for (const channel of [
        'cluster:connect',
        'cluster:is-connected',
        'topics:list',
        'brokers:list',
        'consumer-groups:list'
      ])
        ipcMain.removeHandler(channel)
      ipcMain.handle('cluster:connect', () => ({
        success: true,
        data: { success: true, brokerCount: 1 }
      }))
      ipcMain.handle('cluster:is-connected', () => ({ success: true, data: true }))
      ipcMain.handle('topics:list', () => ({
        success: true,
        data: [
          {
            name: topic,
            partitions: 1,
            replicationFactor: 1,
            messageCount: 42,
            retentionMs: 86400000,
            retentionBytes: -1,
            cleanupPolicy: 'delete',
            isInternal: false,
            isDLQ: false,
            configs: {},
            underReplicatedPartitions: 0
          }
        ]
      }))
      ipcMain.handle('brokers:list', () => ({
        success: true,
        data: [{ id: 0, host: 'localhost', port: 19092, isController: true, configs: {} }]
      }))
      ipcMain.handle('consumer-groups:list', async () => {
        regression.calls++
        await new Promise((resolve) => {
          regression.release = resolve
        })
        return {
          success: true,
          data: [
            {
              groupId: group,
              state: 'CompletingRebalance',
              members: 0,
              protocolType: 'consumer',
              totalLag: 42,
              topics: [topic]
            }
          ]
        }
      })
    },
    { topic, group }
  )
  await page.reload()
  const topicsCard = page.getByRole('region', { name: 'Topics summary', exact: true })
  const brokersCard = page.getByRole('region', { name: 'Brokers summary', exact: true })
  const groupsCard = page.getByRole('region', { name: 'Consumer Groups summary', exact: true })
  await topicsCard.getByText('1', { exact: true }).waitFor()
  await brokersCard.getByText('1', { exact: true }).waitFor()
  assert.equal(await groupsCard.getAttribute('aria-busy'), 'true')
  mkdirSync('output/playwright', { recursive: true })
  await page.screenshot({ path: 'output/playwright/dashboard-partial.png', animations: 'disabled' })
  await page.keyboard.press('Meta+r')
  await page.keyboard.press('Meta+r')
  assert.equal(await app.evaluate(({ app }) => app.dashboardRegression.calls), 1)
  await app.evaluate(({ app }) => app.dashboardRegression.release())
  await groupsCard.getByText('1', { exact: true }).waitFor()
  await page.getByText('CompletingRebalance', { exact: true }).waitFor()
  await page.keyboard.press('Meta+r')
  await app.evaluate(async ({ app }) => {
    const deadline = Date.now() + 5000
    while (app.dashboardRegression.calls < 2) {
      if (Date.now() > deadline) throw new Error('Dashboard refresh did not request new data')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  })
  assert.equal(await groupsCard.getAttribute('aria-busy'), 'false')
  assert(await groupsCard.getByText('1', { exact: true }).isVisible())
  await page.screenshot({ path: 'output/playwright/dashboard-refresh.png', animations: 'disabled' })
  await app.evaluate(({ app }) => app.dashboardRegression.release())
  console.log(
    'Dashboard regression passed: progressive cards, shared requests, cached refresh, unknown group states'
  )
  if (offline) await result(page, 'cluster.delete', [id])
  console.log('Keychain persistence checked; restarting')
  await app.close()
  app = null
  console.log('First process closed')
  const database = readFileSync(path.join(data, 'kafkalens.db')).toString('latin1')
  for (const secret of ['fixture-private', 'fixture-registry', 'fixture-ai'])
    assert(!database.includes(secret), 'plaintext secret persisted')
  page = await start()
  console.log('Restarted')
  assert.equal((await result(page, 'settings.getAI', [])).provider, 'google')
  assert.equal((await result(page, 'settings.getAI', [])).historyEnabled, true)
  if (!offline) {
    assert.equal((await result(page, 'cluster.list', []))[0].password, 'fixture-private')
    await result(page, 'cluster.connect', [id, config])
    measurements.idleConnectedProcesses = await app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({ type: p.type, memory: p.memory }))
    )
    await result(page, 'topics.create', [id, { name: topic, partitions: 2, replicationFactor: 1 }])
    await result(page, 'topics.create', [id, { name: dlq, partitions: 2, replicationFactor: 1 }])
    await result(page, 'messages.produce', [
      id,
      { topic, value: '{"password":"secret","order":42}', key: 'test', valueFormat: 'json' }
    ])
    assert.equal(
      (
        await result(page, 'messages.page', [
          id,
          { topic, offset: 'earliest', keyFilter: '^te(st|x)+$', keyFilterType: 'regex', limit: 2 }
        ])
      ).messages.length,
      1
    )
    for (const partition of [0, 1])
      await result(page, 'messages.produce', [
        id,
        {
          topic: dlq,
          partition,
          key: 'failed',
          value: '{"id":1}',
          headers: { 'kafka_dlt-exception-fqcn': 'TestError', 'kafka_dlt-original-topic': topic }
        }
      ])
    await result(page, 'consumerGroups.resetOffsets', [id, group, topic, { type: 'earliest' }])
    await result(page, 'schema.register', [
      id,
      subject,
      JSON.stringify({
        type: 'record',
        name: 'DesktopRecord',
        fields: [{ name: 'id', type: 'int' }]
      }),
      'AVRO'
    ])
    console.log('Reloading fixture UI')
    await page.reload()
    await page.getByRole('button', { name: 'Topics', exact: true }).click()
    await page.getByLabel('Search topics').fill(topic)
    await page.getByText(topic, { exact: true }).first().click()
    await page.getByRole('button', { name: 'Fetch', exact: true }).click()
    await page.getByText('json', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '0', exact: true }).first().click()
    await page.getByRole('dialog', { name: 'Message details' }).waitFor()
    assert(await page.getByText('order:', { exact: true }).isVisible())
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Partitions', exact: true }).click()
    await page.getByRole('heading', { name: 'Replica topology' }).waitFor()
    await page.getByText('Healthy', { exact: true }).first().waitFor()
    console.log('Checking DLQ')
    await page.getByRole('button', { name: 'DLQ', exact: true }).click()
    await page.getByText(dlq, { exact: true }).click()
    await page.getByLabel('Select 0:0').waitFor()
    await page.getByLabel('Select 1:0').waitFor()
    await page.getByRole('button', { name: 'Mark reviewed', exact: true }).first().click()
    console.log('Reloading fixture UI')
    await page.reload()
    console.log('Checking DLQ')
    await page.getByRole('button', { name: 'DLQ', exact: true }).click()
    await page.getByText(dlq, { exact: true }).click()
    await page.getByText('Reviewed', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Mark reviewed', exact: true }).count(), 1)
    await page.getByLabel('Select 1:0').check()
    await page.getByRole('button', { name: 'Replay selected (1)', exact: true }).click()
    await page.getByRole('alertdialog').waitFor()
    assert(await page.getByRole('button', { name: 'Confirm', exact: true }).isDisabled())
    await page.getByLabel('Resource name confirmation').fill(dlq)
    assert(await page.getByRole('button', { name: 'Confirm', exact: true }).isEnabled())
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('alertdialog').count(), 0)
    mkdirSync('output/playwright', { recursive: true })
    for (const name of ['Consumer Groups', 'Schema Registry', 'Brokers', 'Settings']) {
      await page.getByRole('button', { name, exact: true }).click()
      await page.getByRole('heading', { name, exact: true }).waitFor()
      if (name === 'Consumer Groups') {
        await page.getByText(group, { exact: true }).click()
        await page.getByRole('heading', { name: 'Members', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Reset offsets', exact: true }).click()
        await page.getByRole('alertdialog').waitFor()
        assert(await page.getByRole('button', { name: 'Confirm', exact: true }).isDisabled())
        await page.getByLabel('Resource name confirmation').fill(group)
        assert(await page.getByRole('button', { name: 'Confirm', exact: true }).isEnabled())
        await page.keyboard.press('Escape')
      }
      if (name === 'Schema Registry') {
        await page.getByText(subject, { exact: true }).click()
        await page.getByRole('button', { name: 'Delete version', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Delete version', exact: true }).click()
        await page.getByRole('alertdialog').waitFor()
        assert(await page.getByRole('button', { name: 'Confirm', exact: true }).isDisabled())
        await page.getByLabel('Resource name confirmation').fill(subject)
        assert(await page.getByRole('button', { name: 'Confirm', exact: true }).isEnabled())
        await page.keyboard.press('Escape')
      }
      if (name === 'Brokers') {
        await page
          .getByRole('cell')
          .filter({ hasText: /^num\.network\.threads/ })
          .waitFor()
        const broker = (await result(page, 'brokers.list', [id]))[0].id
        assert((await result(page, 'brokers.history', [id, broker])).length > 0)
        const defaults = await result(page, 'brokers.clusterConfig', [id])
        assert(Object.keys(defaults).length > 0)
      }
      assert(!(await page.getByText('Something went wrong').count()))
      await page.screenshot({
        path: `output/playwright/${name.toLowerCase().replace(/ /g, '-')}.png`,
        animations: 'disabled'
      })
    }
    await page.getByRole('button', { name: 'Topics', exact: true }).click()
    await page.getByLabel('Search topics').fill(topic)
    await page.getByRole('button', { name: 'Config', exact: true }).first().click()
    await page.getByRole('dialog', { name: 'Topic configuration' }).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog', { name: 'Topic configuration' }).count(), 0)
    mkdirSync('output/playwright', { recursive: true })
    await page.screenshot({ path: 'output/playwright/desktop.png' })
    await page.getByTitle('Delete topic').first().click()
    await page.getByRole('dialog', { name: 'Delete topic', exact: true }).waitFor()
    assert(await page.getByRole('button', { name: 'Delete', exact: true }).isDisabled())
    await page.getByLabel('Resource name confirmation').fill(topic)
    assert(await page.getByRole('button', { name: 'Delete', exact: true }).isEnabled())
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog', { name: 'Delete topic', exact: true }).count(), 0)
    await result(page, 'consumerGroups.delete', [id, group])
    await result(page, 'schema.deleteVersion', [id, subject, 1])
    await result(page, 'topics.delete', [id, dlq])
    await result(page, 'topics.delete', [id, topic])
    await result(page, 'cluster.delete', [id])
    await result(page, 'settings.saveAI', [
      { enabled: false, provider: 'google', model: 'test', apiKey: '', redactedFields: [] }
    ])
  } else {
    for (const name of [
      'Topics',
      'Partitions',
      'Consumer Groups',
      'Schema Registry',
      'Brokers',
      'Settings'
    ])
      await page.getByRole('button', { name, exact: true }).click()
    await result(page, 'settings.saveAI', [
      { enabled: false, provider: 'google', model: 'test', apiKey: '', redactedFields: [] }
    ])
  }
  if (offline) {
    mkdirSync('output/playwright', { recursive: true })
    await page.screenshot({ path: 'output/playwright/offline.png' })
  }
  measurements.processes = await app.evaluate(({ app }) =>
    app.getAppMetrics().map((p) => ({ type: p.type, memory: p.memory }))
  )
  mkdirSync('output', { recursive: true })
  const { writeFileSync } = await import('node:fs')
  writeFileSync('output/desktop-performance.json', JSON.stringify(measurements, null, 2))
  assert.deepEqual(errors, [])
  console.log(
    offline
      ? 'Offline desktop checks passed: isolated IPC, native Keychain, restart, and page navigation.'
      : 'Desktop checks passed: isolated IPC, native Keychain, restart, decoding, partitions, DLQ review isolation, production confirmations, and populated feature pages.'
  )
} catch (error) {
  if (app) {
    const page = await app.firstWindow()
    mkdirSync('output/playwright', { recursive: true })
    await page.screenshot({ path: 'output/playwright/failure.png' })
    console.error(await page.locator('body').innerText())
    console.error(errors)
  }
  throw error
} finally {
  if (app) {
    try {
      const page = await app.firstWindow()
      await page
        .evaluate(
          async ({ id, group, subject }) => {
            await window.api.consumerGroups.delete(id, group)
            await window.api.schema.deleteVersion(id, subject, 1)
          },
          { id, group, subject }
        )
        .catch(() => {})
      for (const t of [topic, dlq])
        await page.evaluate(
          async ({ id, t }) => {
            await window.api.topics.delete(id, t)
          },
          { id, t }
        )
    } catch {}
    await app.close().catch(() => {})
  }
  for (const account of [`cluster:${id}`, 'ai'])
    try {
      execFileSync('/usr/bin/security', ['delete-generic-password', '-s', service, '-a', account], {
        stdio: 'pipe'
      })
    } catch {}
  rmSync(data, { recursive: true, force: true })
}
