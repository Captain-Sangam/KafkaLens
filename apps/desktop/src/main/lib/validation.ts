import { z } from 'zod'
export const name = z.string().trim().min(1).max(249)
export const topicName = name
  .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, digits, dots, hyphens, and underscores')
  .refine((v) => v !== '.' && v !== '..')
const records = z.record(z.string(), z.string())
export const clusterInput = z.object({
  id: name,
  name,
  bootstrapServers: name,
  authMethod: z.enum(['none', 'sasl-plain', 'sasl-scram-256', 'sasl-scram-512', 'ssl']),
  ssl: z.boolean().optional(),
  sslRejectUnauthorized: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  sslCertPath: z.string().optional(),
  sslClientCertPath: z.string().optional(),
  sslKeyPath: z.string().optional(),
  schemaRegistryUrl: z.string().url().optional().or(z.literal('')),
  schemaRegistryAuth: z.object({ username: z.string(), password: z.string() }).optional(),
  environmentLabel: z.enum(['local', 'dev', 'staging', 'prod']),
  colorTag: z.string(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export const createTopicInput = z.object({
  name: topicName,
  partitions: z.number().int().min(1).max(1000),
  replicationFactor: z.number().int().min(1).max(100),
  configs: records.optional()
})
export const offsetInput = z
  .object({
    type: z.enum(['earliest', 'latest', 'to-offset', 'to-timestamp']),
    value: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional()
  })
  .refine(
    (v) => !v.type.startsWith('to-') || v.value !== undefined,
    'An offset or timestamp is required'
  )
export const fetchInput = z.object({
  topic: topicName,
  partition: z.number().int().nonnegative().optional(),
  offset: z
    .string()
    .regex(/^(latest|earliest|\d+)$/)
    .optional(),
  offsets: z.record(z.string(), z.string().regex(/^\d+$/)).optional(),
  timestamp: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  requestId: z.string().optional(),
  direction: z.enum(['forward', 'backward']).optional(),
  keyFilter: z.string().max(500).optional(),
  keyFilterType: z.enum(['exact', 'regex']).optional(),
  valueFilter: z.string().max(1000).optional(),
  valueFilterType: z.enum(['substring', 'jsonpath']).optional(),
  timestampStart: z.string().optional(),
  timestampEnd: z.string().optional()
})
export const produceInput = z.object({
  topic: topicName,
  key: z.string().nullable().optional(),
  value: z.string().max(10_000_000),
  partition: z.number().int().nonnegative().optional(),
  headers: records.optional(),
  valueFormat: z.enum(['json', 'string', 'avro', 'protobuf', 'binary']).optional(),
  schemaId: z.number().int().positive().optional(),
  tombstone: z.boolean().optional(),
  rawValue: z.string().optional(),
  rawHeaders: z.record(z.string(), z.array(z.string())).optional(),
  rawKey: z.string().optional()
})
export const aiInput = z.object({
  enabled: z.boolean(),
  provider: z.enum(['openai', 'anthropic', 'google']),
  apiKey: z.string(),
  model: name,
  redactedFields: z.array(z.string()),
  consent: z.boolean().default(false),
  features: z.record(z.string(), z.boolean()).optional(),
  anomalyThreshold: z.number().nonnegative().optional(),
  historyEnabled: z.boolean().optional()
})
