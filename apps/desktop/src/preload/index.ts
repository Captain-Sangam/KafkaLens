import { contextBridge, ipcRenderer } from 'electron'

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args)
}

const api = {
  cluster: {
    testConnection: (config: unknown) => invoke('cluster:test-connection', config),
    connect: (clusterId: string, config: unknown) =>
      invoke('cluster:connect', clusterId, config),
    disconnect: (clusterId: string) => invoke('cluster:disconnect', clusterId),
    isConnected: (clusterId: string) => invoke<boolean>('cluster:is-connected', clusterId),
    list: () => invoke('cluster:list'),
    save: (cluster: unknown) => invoke('cluster:save', cluster),
    update: (id: string, updates: unknown) => invoke('cluster:update', id, updates),
    delete: (id: string) => invoke('cluster:delete', id)
  },

  topics: {
    list: (clusterId: string) => invoke('topics:list', clusterId),
    metadata: (clusterId: string, topic: string) =>
      invoke('topics:metadata', clusterId, topic),
    config: (clusterId: string, topic: string) => invoke('topics:config', clusterId, topic),
    create: (clusterId: string, opts: unknown) => invoke('topics:create', clusterId, opts),
    delete: (clusterId: string, topic: string) => invoke('topics:delete', clusterId, topic),
    alterConfig: (clusterId: string, topic: string, configs: unknown) =>
      invoke('topics:alter-config', clusterId, topic, configs),
    partitions: (clusterId: string, topic: string) =>
      invoke('topics:partitions', clusterId, topic)
  },

  messages: {
    fetch: (clusterId: string, opts: unknown) => invoke('messages:fetch', clusterId, opts),
    produce: (clusterId: string, opts: unknown) => invoke('messages:produce', clusterId, opts)
  },

  consumerGroups: {
    list: (clusterId: string) => invoke('consumer-groups:list', clusterId),
    describe: (clusterId: string, groupId: string) =>
      invoke('consumer-groups:describe', clusterId, groupId),
    offsets: (clusterId: string, groupId: string) =>
      invoke('consumer-groups:offsets', clusterId, groupId),
    resetOffsets: (clusterId: string, groupId: string, topic: string, offsetSpec: unknown) =>
      invoke('consumer-groups:reset-offsets', clusterId, groupId, topic, offsetSpec),
    delete: (clusterId: string, groupId: string) =>
      invoke('consumer-groups:delete', clusterId, groupId)
  },

  brokers: {
    list: (clusterId: string) => invoke('brokers:list', clusterId),
    config: (clusterId: string, brokerId: number) =>
      invoke('brokers:config', clusterId, brokerId)
  },

  schema: {
    configure: (clusterId: string, config: unknown) =>
      invoke('schema:configure', clusterId, config),
    subjects: (clusterId: string) => invoke('schema:subjects', clusterId),
    versions: (clusterId: string, subject: string) =>
      invoke('schema:versions', clusterId, subject),
    get: (clusterId: string, subject: string, version: number | string) =>
      invoke('schema:get', clusterId, subject, version),
    getById: (clusterId: string, id: number) =>
      invoke('schema:get-by-id', clusterId, id),
    compatibility: (clusterId: string, subject: string) =>
      invoke('schema:compatibility', clusterId, subject),
    checkCompatibility: (
      clusterId: string,
      subject: string,
      schema: string,
      schemaType: string
    ) => invoke('schema:check-compatibility', clusterId, subject, schema, schemaType),
    register: (clusterId: string, subject: string, schema: string, schemaType: string) =>
      invoke('schema:register', clusterId, subject, schema, schemaType),
    deleteVersion: (clusterId: string, subject: string, version: number | string) =>
      invoke('schema:delete-version', clusterId, subject, version)
  },

  ai: {
    configure: (config: unknown) => invoke('ai:configure', config),
    isConfigured: () => invoke<boolean>('ai:is-configured'),
    explainMessage: (payload: string, schema?: string) =>
      invoke('ai:explain-message', payload, schema),
    analyzeDLQ: (exceptionClass: string, exceptionMessage: string, payload: string) =>
      invoke('ai:analyze-dlq', exceptionClass, exceptionMessage, payload),
    adviseTopicConfig: (topicName: string, config: unknown, metrics: unknown) =>
      invoke('ai:advise-topic', topicName, config, metrics),
    explainSchemaDiff: (subject: string, before: string, after: string) =>
      invoke('ai:explain-schema-diff', subject, before, after),
    clusterHealth: (data: unknown) => invoke('ai:cluster-health', data)
  },

  settings: {
    get: (key: string) => invoke('settings:get', key),
    set: (key: string, value: unknown) => invoke('settings:set', key, value),
    getAI: () => invoke('settings:get-ai'),
    saveAI: (settings: unknown) => invoke('settings:save-ai', settings)
  },

  favorites: {
    list: (clusterId: string) => invoke('favorites:list', clusterId),
    add: (clusterId: string, topic: string) => invoke('favorites:add', clusterId, topic),
    remove: (clusterId: string, topic: string) => invoke('favorites:remove', clusterId, topic)
  },

  dlq: {
    markReviewed: (clusterId: string, topic: string, partition: number, offset: string) =>
      invoke('dlq:mark-reviewed', clusterId, topic, partition, offset),
    isReviewed: (clusterId: string, topic: string, partition: number, offset: string) =>
      invoke<boolean>('dlq:is-reviewed', clusterId, topic, partition, offset)
  },

  app: {
    version: () => invoke<string>('app:version')
  }
}

export type KafkaLensAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore fallback for non-isolated context
  window.api = api
}
