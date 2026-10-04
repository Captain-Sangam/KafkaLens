// Capture the real desktop UI using disposable, local-only sample data.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Kafka, logLevel } from 'kafkajs'
import { _electron as electron } from 'playwright'

const data = mkdtempSync(path.join(tmpdir(), 'kafkalens-readme-'))
const service = 'com.kafkalens.test.' + createHash('sha256').update(data).digest('hex').slice(0, 12)
const clusterId = 'readme-demo'
const registry = 'http://127.0.0.1:18081'
const topics = [
  'demo.orders.created',
  'demo.orders.shipped',
  'demo.payments.authorized',
  'demo.inventory.updated',
  'demo.shipments.created',
  'demo.notifications.sent',
  'demo.orders.created.DLT',
  'demo.payments.authorized.DLT'
]
const groups = ['demo.orders-worker', 'demo.payments-worker', 'demo.inventory-sync']
const subjects = [
  'demo.orders.created-value',
  'demo.payments.authorized-value',
  'demo.inventory.updated-value'
]
const kafka = new Kafka({ brokers: ['127.0.0.1:19092'], logLevel: logLevel.NOTHING })
const admin = kafka.admin()
const producer = kafka.producer()
let seeded = false
let app
let page
const errors = []

async function api(method, ...args) {
  const result = await page.evaluate(
    async ({ method, args }) => {
      const [domain, action] = method.split('.')
      return window.api[domain][action](...args)
    },
    { method, args }
  )
  assert.equal(result.success, true, result.error)
  return result.data
}
async function register(subject, definition) {
  const response = await fetch(`${registry}/subjects/${subject}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
    body: JSON.stringify({ schemaType: 'AVRO', schema: JSON.stringify(definition) })
  })
  assert(response.ok, `Could not register ${subject}: ${await response.text()}`)
}
async function capture(name) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
    )
  })
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `docs/images/${name}.png`, animations: 'disabled', scale: 'css' })
  console.log(`Captured ${name}`)
}
try {
  await admin.connect()
  const existingTopics = await admin.listTopics()
  const existingGroups = (await admin.listGroups()).groups.map((group) => group.groupId)
  const response = await fetch(`${registry}/subjects`)
  assert(response.ok, 'Start the Kafka/Registry fixture with make fixtures-up first.')
  const existingSubjects = await response.json()
  assert(
    !topics.some((topic) => existingTopics.includes(topic)),
    'Demo topics already exist; use a clean disposable fixture.'
  )
  assert(
    !groups.some((group) => existingGroups.includes(group)),
    'Demo groups already exist; use a clean disposable fixture.'
  )
  assert(
    !subjects.some((subject) => existingSubjects.includes(subject)),
    'Demo schemas already exist; use a clean disposable fixture.'
  )
  seeded = true
  await admin.createTopics({
    topics: topics.map((topic) => ({ topic, numPartitions: 3, replicationFactor: 1 }))
  })
  await producer.connect()
  for (const [topicIndex, topic] of topics.entries()) {
    const isDLQ = topic.endsWith('.DLT')
    await producer.send({
      topic,
      messages: Array.from({ length: isDLQ ? 3 : 36 }, (_, i) => ({
        key: `order-${1042 + i}`,
        partition: i % 3,
        value: JSON.stringify({
          event_id: `evt-${topicIndex + 1}-${i + 1}`,
          order_id: `ORD-${1042 + i}`,
          status: isDLQ ? 'payment_pending' : 'confirmed',
          amount: 149.95,
          currency: 'USD',
          items: [{ sku: 'LENS-001', quantity: 2 }]
        }),
        headers: isDLQ
          ? {
              'kafka_dlt-original-topic': topic.slice(0, -4),
              'kafka_dlt-exception-fqcn': 'PaymentGatewayTimeout',
              'kafka_dlt-exception-message':
                'Sample payment gateway did not respond within 5 seconds'
            }
          : { 'event-type': 'OrderCreated', source: 'readme-demo' }
      }))
    })
  }
  for (const [index, groupId] of groups.entries()) {
    await admin.setOffsets({
      groupId,
      topic: topics[index === 2 ? 3 : index * 2],
      partitions: [
        { partition: 0, offset: '4' },
        { partition: 1, offset: '7' },
        { partition: 2, offset: '10' }
      ]
    })
  }
  const order = {
    type: 'record',
    name: 'OrderCreated',
    namespace: 'demo.events',
    fields: [
      { name: 'order_id', type: 'string' },
      { name: 'amount', type: 'double' },
      { name: 'currency', type: 'string' },
      { name: 'status', type: 'string' }
    ]
  }
  await register(subjects[0], order)
  await register(subjects[0], {
    ...order,
    fields: [...order.fields, { name: 'warehouse_id', type: ['null', 'string'], default: null }]
  })
  for (const [index, name] of ['PaymentAuthorized', 'InventoryUpdated'].entries()) {
    await register(subjects[index + 1], {
      type: 'record',
      name,
      namespace: 'demo.events',
      fields: [
        { name: 'event_id', type: 'string' },
        { name: 'order_id', type: 'string' }
      ]
    })
  }
  const env = { ...process.env, KAFKALENS_TEST_DATA: data }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: ['apps/desktop'], env, timeout: 30000 })
  page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
  await api('cluster.save', {
    id: clusterId,
    name: 'Local demo',
    bootstrapServers: '127.0.0.1:19092',
    authMethod: 'none',
    environmentLabel: 'local',
    colorTag: '#6366f1',
    schemaRegistryUrl: registry,
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
  await page.reload()
  await page.getByText('Connected', { exact: true }).first().waitFor()
  const visibleTopics = (await api('topics.list', clusterId)).filter((topic) => !topic.isInternal)
  await page
    .getByRole('region', { name: 'Topics summary', exact: true })
    .getByText(String(visibleTopics.length), { exact: true })
    .waitFor()
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll('[role="region"][aria-label$=" summary"]')
    return (
      cards.length === 4 && [...cards].every((card) => card.getAttribute('aria-busy') === 'false')
    )
  })
  mkdirSync('docs/images', { recursive: true })
  await capture('dashboard')
  await page.getByRole('button', { name: 'Topics', exact: true }).click()
  await page.getByText(topics[0], { exact: true }).first().click()
  await page.getByLabel('Offset mode').selectOption('earliest')
  await page.getByRole('button', { name: 'Fetch', exact: true }).click()
  await page.getByText('json', { exact: true }).first().waitFor()
  await capture('messages')
  await page.getByRole('button', { name: 'Consumer Groups', exact: true }).click()
  await page.getByRole('button', { name: groups[0], exact: true }).click()
  await page.getByRole('heading', { name: 'Members', exact: true }).waitFor()
  await page.getByText('Current offset', { exact: true }).waitFor()
  await capture('consumer-groups')
  await page.getByRole('button', { name: 'Schema Registry', exact: true }).click()
  await page.getByText(subjects[0], { exact: true }).first().click()
  await page.getByRole('button', { name: 'Delete version', exact: true }).waitFor()
  await page.getByLabel('Compare schema version').selectOption('1')
  await page.getByText('warehouse_id', { exact: false }).first().waitFor()
  await capture('schema-registry')
  assert.deepEqual(errors, [])
} finally {
  if (app) await app.close().catch(() => {})
  if (seeded) {
    await admin.deleteGroups(groups).catch(() => {})
    for (const subject of subjects) {
      await fetch(`${registry}/subjects/${subject}`, { method: 'DELETE' }).catch(() => {})
      await fetch(`${registry}/subjects/${subject}?permanent=true`, { method: 'DELETE' }).catch(
        () => {}
      )
    }
    await admin.deleteTopics({ topics }).catch(() => {})
  }
  await producer.disconnect().catch(() => {})
  await admin.disconnect().catch(() => {})
  try {
    execFileSync(
      '/usr/bin/security',
      ['delete-generic-password', '-s', service, '-a', `cluster:${clusterId}`],
      { stdio: 'pipe' }
    )
  } catch {}
  rmSync(data, { recursive: true, force: true })
}
