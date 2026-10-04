import { ipcMain, app, dialog } from 'electron'
import { z } from 'zod'
import { updateService } from './services/update-service'
import { kafkaService } from './services/kafka-service'
import { schemaService } from './services/schema-service'
import { payloadService } from './services/payload-service'
import { aiService } from './services/ai-service'
import { storeService } from './services/store-service'
import {
  clusterInput,
  createTopicInput,
  offsetInput,
  fetchInput,
  produceInput,
  aiInput,
  name,
  topicName
} from './lib/validation'
const text = z.string()
const integer = z.number().int().nonnegative()
const configs = z.record(z.string(), z.string())
function handle<A extends unknown[], T>(
  channel: string,
  input: z.ZodType<A>,
  fn: (...args: A) => T | Promise<T>
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      const url = event.senderFrame?.url ?? ''
      const dev = process.env.ELECTRON_RENDERER_URL
      if (
        event.senderFrame !== event.sender.mainFrame ||
        !(url.startsWith('file:') || (dev && new URL(url).origin === new URL(dev).origin))
      )
        throw new Error('Request rejected from an untrusted window')
      return { success: true, data: await fn(...input.parse(args)) }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join('; ')
            : error instanceof Error
              ? error.message
              : 'Operation failed. Try again.'
      }
    }
  })
}
export function registerAllIpcHandlers(): void {
  handle('cluster:test-connection', z.tuple([clusterInput]), (config) =>
    kafkaService.testConnection(config)
  )
  handle('cluster:connect', z.tuple([name, clusterInput]), async (id, config) => {
    const result = await kafkaService.connect(id, config)
    payloadService.clear(id)
    schemaService.clear(id)
    if (result.success && config.schemaRegistryUrl)
      schemaService.configure(id, { url: config.schemaRegistryUrl, ...config.schemaRegistryAuth })
    return result
  })
  handle('cluster:disconnect', z.tuple([name]), async (id) => {
    schemaService.clear(id)
    await kafkaService.disconnect(id)
  })
  handle('cluster:is-connected', z.tuple([name]), (id) => kafkaService.isConnected(id))
  handle('cluster:list', z.tuple([]), () => storeService.getClusters())
  handle('cluster:save', z.tuple([clusterInput]), (config) => storeService.saveCluster(config))
  handle('cluster:update', z.tuple([name, clusterInput.partial()]), (id, updates) =>
    storeService.updateCluster(id, updates)
  )
  handle('cluster:delete', z.tuple([name]), async (id) => {
    await kafkaService.disconnect(id)
    schemaService.clear(id)
    storeService.deleteCluster(id)
  })
  handle('topics:list', z.tuple([name]), (id) => kafkaService.listTopics(id))
  handle('topics:metadata', z.tuple([name, topicName]), (id, topic) =>
    kafkaService.getTopicMetadata(id, topic)
  )
  handle('topics:partitions', z.tuple([name, topicName]), (id, topic) =>
    kafkaService.getPartitions(id, topic)
  )
  handle('topics:config', z.tuple([name, topicName]), (id, topic) =>
    kafkaService.getTopicConfig(id, topic)
  )
  handle('topics:create', z.tuple([name, createTopicInput]), (id, opts) =>
    kafkaService.createTopic(id, opts)
  )
  handle('topics:delete', z.tuple([name, topicName]), (id, topic) =>
    kafkaService.deleteTopic(id, topic)
  )
  handle('topics:alter-config', z.tuple([name, topicName, configs]), (id, topic, values) =>
    kafkaService.alterTopicConfig(id, topic, values)
  )
  handle('messages:page', z.tuple([name, fetchInput]), (id, opts) =>
    kafkaService.fetchMessagePage(id, opts)
  )
  handle('messages:fetch', z.tuple([name, fetchInput]), (id, opts) =>
    kafkaService.fetchMessages(id, opts)
  )
  handle('messages:cancel', z.tuple([name]), (id) => kafkaService.cancelRead(id))
  handle('messages:produce', z.tuple([name, produceInput]), (id, opts) =>
    kafkaService.produceMessage(id, opts)
  )
  handle('consumer-groups:list', z.tuple([name]), (id) => kafkaService.listConsumerGroups(id))
  handle('consumer-groups:describe', z.tuple([name, name]), (id, group) =>
    kafkaService.describeConsumerGroup(id, group)
  )
  handle('consumer-groups:offsets', z.tuple([name, name]), (id, group) =>
    kafkaService.getConsumerGroupOffsets(id, group)
  )
  handle(
    'consumer-groups:reset-offsets',
    z.tuple([name, name, topicName, offsetInput]),
    (id, group, topic, spec) => kafkaService.resetConsumerGroupOffsets(id, group, topic, spec)
  )
  handle('consumer-groups:delete', z.tuple([name, name]), (id, group) =>
    kafkaService.deleteConsumerGroup(id, group)
  )
  handle('brokers:list', z.tuple([name]), (id) => kafkaService.listBrokers(id))
  handle('brokers:config', z.tuple([name, integer]), async (id, broker) => {
    const values = await kafkaService.describeBrokerConfig(id, broker)
    storeService.recordConfig(id, broker, values)
    return values
  })
  handle('brokers:history', z.tuple([name, integer]), (id, broker) =>
    storeService.configHistory(id, broker)
  )
  handle('brokers:cluster-config', z.tuple([name]), (id) => kafkaService.describeClusterConfig(id))
  handle('brokers:partitions', z.tuple([name, integer]), async (id, broker) => {
    const topics = await kafkaService.listTopics(id)
    const result = []
    for (const topic of topics) {
      for (const partition of await kafkaService.getPartitions(id, topic.name))
        if (partition.replicas.includes(broker))
          result.push({
            topic: topic.name,
            partition,
            role: partition.leader === broker ? 'leader' : 'replica'
          })
    }
    return result
  })
  handle(
    'schema:configure',
    z.tuple([
      name,
      z.object({ url: z.string().url(), username: text.optional(), password: text.optional() })
    ]),
    (id, config) => {
      payloadService.clear(id)
      schemaService.configure(id, config)
    }
  )
  handle('schema:subjects', z.tuple([name]), (id) => schemaService.listSubjects(id))
  handle('schema:versions', z.tuple([name, name]), (id, subject) =>
    schemaService.getVersions(id, subject)
  )
  handle(
    'schema:get',
    z.tuple([name, name, z.union([integer, z.literal('latest')])]),
    (id, subject, version) => schemaService.getSchema(id, subject, version)
  )
  handle('schema:get-by-id', z.tuple([name, integer]), (id, schema) =>
    schemaService.getSchemaById(id, schema)
  )
  handle('schema:compatibility', z.tuple([name, name]), (id, subject) =>
    schemaService.getCompatibility(id, subject)
  )
  const schemaArgs = z.tuple([
    name,
    name,
    text.min(1).max(1_000_000),
    z.enum(['AVRO', 'PROTOBUF', 'JSON'])
  ])
  handle('schema:check-compatibility', schemaArgs, (id, subject, schema, type) =>
    schemaService.checkCompatibility(id, subject, schema, type)
  )
  handle('schema:register', schemaArgs, async (id, subject, schema, type) => {
    let exists = true
    try {
      await schemaService.getVersions(id, subject)
    } catch (error) {
      if ((error as { status?: number }).status === 404) exists = false
      else throw error
    }
    if (exists) {
      const check = await schemaService.checkCompatibility(id, subject, schema, type)
      if (!check.is_compatible)
        throw new Error('Schema is incompatible with the subject rules. Fix it before registering.')
    }
    return schemaService.registerSchema(id, subject, schema, type)
  })
  handle(
    'schema:delete-version',
    z.tuple([name, name, z.union([integer, z.literal('latest')])]),
    (id, subject, version) => schemaService.deleteSchemaVersion(id, subject, version)
  )
  handle('ai:configure', z.tuple([aiInput]), (config) => aiService.configure(config))
  handle('ai:is-configured', z.tuple([]), () => aiService.isConfigured())
  handle('ai:explain-message', z.tuple([text, text.optional()]), (payload, schema?) =>
    aiService.explainMessage(payload, schema)
  )
  handle('ai:analyze-dlq', z.tuple([text, text, text]), (kind, message, payload) =>
    aiService.analyzeDLQRootCause(kind, message, payload)
  )
  handle(
    'ai:advise-topic',
    z.tuple([
      name,
      configs,
      z.object({
        messageCount: z.number(),
        partitions: z.number(),
        consumerLag: z.number(),
        partitionCounts: z.record(z.string(), z.number()).optional()
      })
    ]),
    (topic, config, metrics) => aiService.adviseTopicConfig(topic, config, metrics)
  )
  handle('ai:explain-schema-diff', z.tuple([name, text, text]), (subject, before, after) =>
    aiService.explainSchemaDiff(subject, before, after)
  )
  handle(
    'ai:cluster-health',
    z.tuple([
      z
        .object({
          topics: z.number(),
          consumerGroups: z.number(),
          brokers: z.number(),
          underReplicatedPartitions: z.number(),
          totalLag: z.number(),
          dlqMessages: z.number()
        })
        .passthrough()
    ]),
    (data) => aiService.summarizeClusterHealth(data)
  )
  handle(
    'ai:search-topics',
    z.tuple([text.min(1).max(1000), z.array(name).max(5000)]),
    (query, topics) => aiService.searchTopics(query, topics)
  )
  handle(
    'ai:lag-anomaly',
    z.tuple([name, z.array(z.object({ at: z.number(), lag: z.number() })).max(360)]),
    (group, samples) => aiService.lagAnomaly(group, samples)
  )
  handle('ai:models', z.tuple([aiInput]), (settings) => aiService.models(settings))
  handle('ai:cancel', z.tuple([]), () => aiService.cancel())
  handle('ai:history', z.tuple([]), () => storeService.aiHistory())
  handle('ai:clear-history', z.tuple([]), () => storeService.clearAIHistory())
  handle('settings:get', z.tuple([text.min(1).max(1000)]), (key) => {
    if (key === 'ai_config') throw new Error('Use AI settings')
    return storeService.getSetting(key)
  })
  handle('settings:set', z.tuple([text.min(1).max(1000), text.max(1_000_000)]), (key, value) => {
    if (key === 'ai_config') throw new Error('Use AI settings')
    storeService.setSetting(key, value)
  })
  handle('settings:get-ai', z.tuple([]), () => storeService.getAISettings())
  handle('settings:save-ai', z.tuple([aiInput]), (settings) => {
    storeService.saveAISettings(settings)
    aiService.configure(settings)
  })
  handle('favorites:list', z.tuple([name]), (id) => storeService.getFavorites(id))
  handle('favorites:add', z.tuple([name, topicName]), (id, topic) =>
    storeService.addFavorite(id, topic)
  )
  handle('favorites:remove', z.tuple([name, topicName]), (id, topic) =>
    storeService.removeFavorite(id, topic)
  )
  const dlqArgs = z.tuple([name, topicName, integer, z.string().regex(/^\d+$/)])
  handle('dlq:mark-reviewed', dlqArgs, (id, topic, partition, offset) =>
    storeService.markDLQReviewed(id, topic, partition, offset)
  )
  handle('dlq:is-reviewed', dlqArgs, (id, topic, partition, offset) =>
    storeService.isDLQReviewed(id, topic, partition, offset)
  )
  handle('app:version', z.tuple([]), () => app.getVersion())
  handle('app:select-certificate', z.tuple([]), async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose certificate or private key',
      properties: ['openFile'],
      filters: [{ name: 'Certificates', extensions: ['pem', 'crt', 'cer', 'key'] }]
    })
    return result.canceled ? undefined : result.filePaths[0]
  })
  handle('app:check-update', z.tuple([]), () => updateService.check())
  handle('app:update-state', z.tuple([]), () => updateService.getState())
  handle('app:download-update', z.tuple([]), () => updateService.download())
  handle('app:install-update', z.tuple([]), () => updateService.install())
}
