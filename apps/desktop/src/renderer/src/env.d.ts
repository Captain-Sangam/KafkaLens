/// <reference types="vite/client" />

interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

interface Window {
  api: {
    cluster: {
      testConnection: (config: unknown) => Promise<IpcResult>
      connect: (clusterId: string, config: unknown) => Promise<IpcResult>
      disconnect: (clusterId: string) => Promise<IpcResult>
      isConnected: (clusterId: string) => Promise<IpcResult<boolean>>
      list: () => Promise<IpcResult>
      save: (cluster: unknown) => Promise<IpcResult>
      update: (id: string, updates: unknown) => Promise<IpcResult>
      delete: (id: string) => Promise<IpcResult>
    }
    topics: {
      list: (clusterId: string) => Promise<IpcResult>
      metadata: (clusterId: string, topic: string) => Promise<IpcResult>
      config: (clusterId: string, topic: string) => Promise<IpcResult>
      create: (clusterId: string, opts: unknown) => Promise<IpcResult>
      delete: (clusterId: string, topic: string) => Promise<IpcResult>
      alterConfig: (clusterId: string, topic: string, configs: unknown) => Promise<IpcResult>
      partitions: (clusterId: string, topic: string) => Promise<IpcResult>
    }
    messages: {
      fetch: (clusterId: string, opts: unknown) => Promise<IpcResult>
      produce: (clusterId: string, opts: unknown) => Promise<IpcResult>
    }
    consumerGroups: {
      list: (clusterId: string) => Promise<IpcResult>
      describe: (clusterId: string, groupId: string) => Promise<IpcResult>
      offsets: (clusterId: string, groupId: string) => Promise<IpcResult>
      resetOffsets: (
        clusterId: string,
        groupId: string,
        topic: string,
        offsetSpec: unknown
      ) => Promise<IpcResult>
      delete: (clusterId: string, groupId: string) => Promise<IpcResult>
    }
    brokers: {
      list: (clusterId: string) => Promise<IpcResult>
      config: (clusterId: string, brokerId: number) => Promise<IpcResult>
    }
    schema: {
      configure: (clusterId: string, config: unknown) => Promise<IpcResult>
      subjects: (clusterId: string) => Promise<IpcResult>
      versions: (clusterId: string, subject: string) => Promise<IpcResult>
      get: (clusterId: string, subject: string, version: number | string) => Promise<IpcResult>
      getById: (clusterId: string, id: number) => Promise<IpcResult>
      compatibility: (clusterId: string, subject: string) => Promise<IpcResult>
      checkCompatibility: (
        clusterId: string,
        subject: string,
        schema: string,
        schemaType: string
      ) => Promise<IpcResult>
      register: (
        clusterId: string,
        subject: string,
        schema: string,
        schemaType: string
      ) => Promise<IpcResult>
      deleteVersion: (
        clusterId: string,
        subject: string,
        version: number | string
      ) => Promise<IpcResult>
    }
    ai: {
      configure: (config: unknown) => Promise<IpcResult>
      isConfigured: () => Promise<IpcResult<boolean>>
      explainMessage: (payload: string, schema?: string) => Promise<IpcResult>
      analyzeDLQ: (
        exceptionClass: string,
        exceptionMessage: string,
        payload: string
      ) => Promise<IpcResult>
      adviseTopicConfig: (
        topicName: string,
        config: unknown,
        metrics: unknown
      ) => Promise<IpcResult>
      explainSchemaDiff: (subject: string, before: string, after: string) => Promise<IpcResult>
      clusterHealth: (data: unknown) => Promise<IpcResult>
    }
    settings: {
      get: (key: string) => Promise<IpcResult>
      set: (key: string, value: unknown) => Promise<IpcResult>
      getAI: () => Promise<IpcResult>
      saveAI: (settings: unknown) => Promise<IpcResult>
    }
    favorites: {
      list: (clusterId: string) => Promise<IpcResult>
      add: (clusterId: string, topic: string) => Promise<IpcResult>
      remove: (clusterId: string, topic: string) => Promise<IpcResult>
    }
    dlq: {
      markReviewed: (
        clusterId: string,
        topic: string,
        partition: number,
        offset: string
      ) => Promise<IpcResult>
      isReviewed: (
        clusterId: string,
        topic: string,
        partition: number,
        offset: string
      ) => Promise<IpcResult<boolean>>
    }
    app: {
      version: () => Promise<IpcResult<string>>
    }
  }
}
