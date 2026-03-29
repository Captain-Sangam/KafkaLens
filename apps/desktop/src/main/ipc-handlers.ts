import { ipcMain, app } from 'electron'
import { kafkaService } from './services/kafka-service'
import { schemaService } from './services/schema-service'
import { aiService } from './services/ai-service'
import { storeService } from './services/store-service'

type IpcResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string }

function wrapError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function registerClusterHandlers(): void {
  ipcMain.handle('cluster:test-connection', async (_event, config) => {
    try {
      const data = await kafkaService.testConnection(config)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('cluster:connect', async (_event, clusterId, config) => {
    try {
      const data = await kafkaService.connect(clusterId, config)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('cluster:disconnect', async (_event, clusterId) => {
    try {
      const data = await kafkaService.disconnect(clusterId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('cluster:is-connected', async (_event, clusterId) => {
    try {
      const data = kafkaService.isConnected(clusterId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('cluster:list', async () => {
    try {
      const data = storeService.getClusters()
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('cluster:save', async (_event, cluster) => {
    try {
      const data = storeService.saveCluster(cluster)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('cluster:update', async (_event, id, updates) => {
    try {
      const data = storeService.updateCluster(id, updates)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('cluster:delete', async (_event, id) => {
    try {
      storeService.deleteCluster(id)
      await kafkaService.disconnect(id)
      return { success: true, data: undefined } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

function registerTopicHandlers(): void {
  ipcMain.handle('topics:list', async (_event, clusterId) => {
    try {
      const data = await kafkaService.listTopics(clusterId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('topics:metadata', async (_event, clusterId, topic) => {
    try {
      const data = await kafkaService.getTopicMetadata(clusterId, topic)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('topics:config', async (_event, clusterId, topic) => {
    try {
      const data = await kafkaService.getTopicConfig(clusterId, topic)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('topics:create', async (_event, clusterId, opts) => {
    try {
      const data = await kafkaService.createTopic(clusterId, opts)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('topics:delete', async (_event, clusterId, topic) => {
    try {
      const data = await kafkaService.deleteTopic(clusterId, topic)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('topics:alter-config', async (_event, clusterId, topic, configs) => {
    try {
      const data = await kafkaService.alterTopicConfig(clusterId, topic, configs)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('topics:partitions', async (_event, clusterId, topic) => {
    try {
      const data = await kafkaService.getPartitions(clusterId, topic)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

function registerMessageHandlers(): void {
  ipcMain.handle('messages:fetch', async (_event, clusterId, opts) => {
    try {
      const data = await kafkaService.fetchMessages(clusterId, opts)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('messages:produce', async (_event, clusterId, opts) => {
    try {
      const data = await kafkaService.produceMessage(clusterId, opts)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

function registerConsumerGroupHandlers(): void {
  ipcMain.handle('consumer-groups:list', async (_event, clusterId) => {
    try {
      const data = await kafkaService.listConsumerGroups(clusterId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('consumer-groups:describe', async (_event, clusterId, groupId) => {
    try {
      const data = await kafkaService.describeConsumerGroup(clusterId, groupId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('consumer-groups:offsets', async (_event, clusterId, groupId) => {
    try {
      const data = await kafkaService.getConsumerGroupOffsets(clusterId, groupId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle(
    'consumer-groups:reset-offsets',
    async (_event, clusterId, groupId, topic, offsetSpec) => {
      try {
        const data = await kafkaService.resetConsumerGroupOffsets(
          clusterId,
          groupId,
          topic,
          offsetSpec
        )
        return { success: true, data } satisfies IpcResult
      } catch (error) {
        return { success: false, error: wrapError(error) } satisfies IpcResult
      }
    }
  )

  ipcMain.handle('consumer-groups:delete', async (_event, clusterId, groupId) => {
    try {
      const data = await kafkaService.deleteConsumerGroup(clusterId, groupId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

function registerBrokerHandlers(): void {
  ipcMain.handle('brokers:list', async (_event, clusterId) => {
    try {
      const data = await kafkaService.listBrokers(clusterId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('brokers:config', async (_event, clusterId, brokerId) => {
    try {
      const data = await kafkaService.describeBrokerConfig(clusterId, brokerId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

function registerSchemaHandlers(): void {
  ipcMain.handle('schema:configure', async (_event, clusterId, config) => {
    try {
      const data = await schemaService.configure(clusterId, config)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('schema:subjects', async (_event, clusterId) => {
    try {
      const data = await schemaService.listSubjects(clusterId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('schema:versions', async (_event, clusterId, subject) => {
    try {
      const data = await schemaService.getVersions(clusterId, subject)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('schema:get', async (_event, clusterId, subject, version) => {
    try {
      const data = await schemaService.getSchema(clusterId, subject, version)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('schema:get-by-id', async (_event, clusterId, id) => {
    try {
      const data = await schemaService.getSchemaById(clusterId, id)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('schema:compatibility', async (_event, clusterId, subject) => {
    try {
      const data = await schemaService.getCompatibility(clusterId, subject)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle(
    'schema:check-compatibility',
    async (_event, clusterId, subject, schema, schemaType) => {
      try {
        const data = await schemaService.checkCompatibility(
          clusterId,
          subject,
          schema,
          schemaType
        )
        return { success: true, data } satisfies IpcResult
      } catch (error) {
        return { success: false, error: wrapError(error) } satisfies IpcResult
      }
    }
  )

  ipcMain.handle(
    'schema:register',
    async (_event, clusterId, subject, schema, schemaType) => {
      try {
        const data = await schemaService.registerSchema(clusterId, subject, schema, schemaType)
        return { success: true, data } satisfies IpcResult
      } catch (error) {
        return { success: false, error: wrapError(error) } satisfies IpcResult
      }
    }
  )

  ipcMain.handle('schema:delete-version', async (_event, clusterId, subject, version) => {
    try {
      const data = await schemaService.deleteSchemaVersion(clusterId, subject, version)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

function registerAIHandlers(): void {
  ipcMain.handle('ai:configure', async (_event, config) => {
    try {
      aiService.configure(config)
      return { success: true, data: undefined } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('ai:is-configured', async () => {
    try {
      const data = aiService.isConfigured()
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('ai:explain-message', async (_event, payload, schema?) => {
    try {
      const data = await aiService.explainMessage(payload, schema)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle(
    'ai:analyze-dlq',
    async (_event, exceptionClass, exceptionMessage, payload) => {
      try {
        const data = await aiService.analyzeDLQRootCause(exceptionClass, exceptionMessage, payload)
        return { success: true, data } satisfies IpcResult
      } catch (error) {
        return { success: false, error: wrapError(error) } satisfies IpcResult
      }
    }
  )

  ipcMain.handle('ai:advise-topic', async (_event, topicName, config, metrics) => {
    try {
      const data = await aiService.adviseTopicConfig(topicName, config, metrics)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('ai:explain-schema-diff', async (_event, subject, before, after) => {
    try {
      const data = await aiService.explainSchemaDiff(subject, before, after)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('ai:cluster-health', async (_event, data) => {
    try {
      const result = await aiService.summarizeClusterHealth(data)
      return { success: true, data: result } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async (_event, key) => {
    try {
      const data = storeService.getSetting(key)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('settings:set', async (_event, key, value) => {
    try {
      storeService.setSetting(key, value)
      return { success: true, data: undefined } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('settings:get-ai', async () => {
    try {
      const data = storeService.getAISettings()
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('settings:save-ai', async (_event, settings) => {
    try {
      storeService.saveAISettings(settings)
      return { success: true, data: undefined } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('favorites:list', async (_event, clusterId) => {
    try {
      const data = storeService.getFavorites(clusterId)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('favorites:add', async (_event, clusterId, topic) => {
    try {
      storeService.addFavorite(clusterId, topic)
      return { success: true, data: undefined } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('favorites:remove', async (_event, clusterId, topic) => {
    try {
      storeService.removeFavorite(clusterId, topic)
      return { success: true, data: undefined } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('dlq:mark-reviewed', async (_event, clusterId, topic, partition, offset) => {
    try {
      storeService.markDLQReviewed(clusterId, topic, partition, offset)
      return { success: true, data: undefined } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })

  ipcMain.handle('dlq:is-reviewed', async (_event, clusterId, topic, partition, offset) => {
    try {
      const data = storeService.isDLQReviewed(clusterId, topic, partition, offset)
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

function registerAppHandlers(): void {
  ipcMain.handle('app:version', async () => {
    try {
      const data = app.getVersion()
      return { success: true, data } satisfies IpcResult
    } catch (error) {
      return { success: false, error: wrapError(error) } satisfies IpcResult
    }
  })
}

export function registerAllIpcHandlers(): void {
  registerClusterHandlers()
  registerTopicHandlers()
  registerMessageHandlers()
  registerConsumerGroupHandlers()
  registerBrokerHandlers()
  registerSchemaHandlers()
  registerAIHandlers()
  registerSettingsHandlers()
  registerAppHandlers()
}
