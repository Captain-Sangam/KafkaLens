import avro from 'avsc'
import protobuf from 'protobufjs'
import { schemaService } from './schema-service'
import type { PayloadFormat, SchemaDefinition } from '../../renderer/src/types'
interface Decoded {
  value: string
  format: PayloadFormat
  schemaId?: number
  raw?: string
  error?: string
}
function protobufIndex(buffer: Buffer): { indexes: number[]; offset: number } {
  let offset = 5
  const read = (): number => {
    let n = 0,
      shift = 0
    while (offset < buffer.length && shift <= 28) {
      const b = buffer[offset++]
      n |= (b & 127) << shift
      if (!(b & 128)) return (n >>> 1) ^ -(n & 1)
      shift += 7
    }
    throw new Error('Invalid Protobuf message index')
  }
  const count = read()
  if (count === 0) return { indexes: [0], offset }
  if (count < 0 || count > 100) throw new Error('Invalid Protobuf message index count')
  const indexes = Array.from({ length: count }, read)
  if (indexes.some((i) => i < 0)) throw new Error('Invalid Protobuf index')
  return { indexes, offset }
}
function messageTypes(namespace: protobuf.Namespace): protobuf.Type[] {
  return namespace.nestedArray.flatMap((n) =>
    n instanceof protobuf.Type ? [n] : n instanceof protobuf.Namespace ? messageTypes(n) : []
  )
}
export class PayloadService {
  private avroTypes = new Map<string, avro.Type>()
  private protoRoots = new Map<string, protobuf.Root>()
  private async compileAvro(
    cluster: string,
    id: number,
    schema: SchemaDefinition
  ): Promise<avro.Type> {
    const key = `${cluster}:${id}`
    const cached = this.avroTypes.get(key)
    if (cached) return cached
    const registry: Record<string, avro.Type> = {}
    const visiting = new Set<string>()
    const compiled = new Set<string>()
    const load = async (definition: SchemaDefinition): Promise<void> => {
      for (const ref of definition.references ?? []) {
        const refKey = `${ref.subject}:${ref.version}`
        if (compiled.has(refKey)) continue
        if (visiting.has(refKey) || visiting.size >= 100)
          throw new Error('Schema reference cycle or excessive depth')
        visiting.add(refKey)
        const referenced = await schemaService.getSchema(cluster, ref.subject, ref.version)
        await load(await schemaService.getSchemaById(cluster, referenced.id))
        registry[ref.name] = avro.Type.forSchema(JSON.parse(referenced.schema), { registry })
        visiting.delete(refKey)
        compiled.add(refKey)
      }
    }
    await load(schema)
    const type = avro.Type.forSchema(JSON.parse(schema.schema), { registry })
    if (this.avroTypes.size >= 500) this.avroTypes.clear()
    this.avroTypes.set(key, type)
    return type
  }
  private async compileProto(
    cluster: string,
    id: number,
    schema: SchemaDefinition
  ): Promise<protobuf.Root> {
    const key = `${cluster}:${id}`
    const cached = this.protoRoots.get(key)
    if (cached) return cached
    const root = new protobuf.Root()
    const seen = new Set<string>()
    const load = async (definition: SchemaDefinition): Promise<void> => {
      protobuf.parse(definition.schema, root, { keepCase: true })
      for (const ref of definition.references ?? []) {
        if (seen.has(ref.name)) continue
        if (seen.size >= 100) throw new Error('Too many Protobuf references')
        seen.add(ref.name)
        const referenced = await schemaService.getSchema(cluster, ref.subject, ref.version)
        await load(await schemaService.getSchemaById(cluster, referenced.id))
      }
    }
    await load(schema)
    root.resolveAll()
    if (this.protoRoots.size >= 500) this.protoRoots.clear()
    this.protoRoots.set(key, root)
    return root
  }
  clear(cluster: string): void {
    for (const key of this.avroTypes.keys())
      if (key.startsWith(cluster + ':')) this.avroTypes.delete(key)
    for (const key of this.protoRoots.keys())
      if (key.startsWith(cluster + ':')) this.protoRoots.delete(key)
  }
  async decode(cluster: string, buffer: Buffer | null): Promise<Decoded> {
    if (!buffer) return { value: '', format: 'string' }
    const raw = buffer.toString('base64')
    if (buffer.length >= 5 && buffer[0] === 0) {
      const id = buffer.readUInt32BE(1)
      try {
        const schema = await schemaService.getSchemaById(cluster, id)
        if (schema.schemaType === 'PROTOBUF') {
          const { indexes, offset } = protobufIndex(buffer)
          const root = await this.compileProto(cluster, id, schema)
          let type = messageTypes(root)[indexes[0]]
          for (const index of indexes.slice(1))
            type = type
              ? (type.nestedArray.filter((n) => n instanceof protobuf.Type)[index] as protobuf.Type)
              : (undefined as unknown as protobuf.Type)
          if (!type) throw new Error('Protobuf message index not found in schema')
          return {
            value: JSON.stringify(
              type.toObject(type.decode(buffer.subarray(offset)), {
                longs: String,
                enums: String,
                bytes: String
              }),
              null,
              2
            ),
            format: 'protobuf',
            schemaId: id,
            raw
          }
        }
        if (schema.schemaType === 'JSON')
          return { value: buffer.subarray(5).toString('utf8'), format: 'json', schemaId: id, raw }
        const type = await this.compileAvro(cluster, id, schema)
        return {
          value: JSON.stringify(type.fromBuffer(buffer.subarray(5)), null, 2),
          format: 'avro',
          schemaId: id,
          raw
        }
      } catch (error) {
        return {
          value: buffer.toString('hex'),
          format: 'binary',
          schemaId: id,
          raw,
          error: error instanceof Error ? error.message : 'Could not decode schema payload'
        }
      }
    }
    const text = buffer.toString('utf8')
    if (!Buffer.from(text).equals(buffer) || buffer.some((b) => b <= 8 || (b >= 14 && b <= 31)))
      return { value: buffer.toString('hex'), format: 'binary', raw }
    try {
      JSON.parse(text)
      return { value: text, format: 'json', raw }
    } catch {
      return { value: text, format: 'string', raw }
    }
  }
  async encode(
    cluster: string,
    value: string,
    format: PayloadFormat | undefined,
    schemaId?: number
  ): Promise<Buffer> {
    if (format === 'binary') {
      if (!/^(?:[a-fA-F0-9]{2})*$/.test(value))
        throw new Error('Binary values must contain hexadecimal byte pairs')
      return Buffer.from(value, 'hex')
    }
    if (format === 'json') {
      JSON.parse(value)
      return Buffer.from(value)
    }
    if (format === 'avro' || format === 'protobuf') {
      if (!schemaId) throw new Error('Choose a Schema Registry ID for this message')
      const schema = await schemaService.getSchemaById(cluster, schemaId)
      const header = Buffer.alloc(5)
      header.writeUInt32BE(schemaId, 1)
      if (format === 'avro') {
        if (schema.schemaType && schema.schemaType !== 'AVRO')
          throw new Error('Choose an Avro schema')
        const type = await this.compileAvro(cluster, schemaId, schema)
        return Buffer.concat([header, type.toBuffer(JSON.parse(value))])
      }
      throw new Error('Protobuf production is not supported; use Avro, JSON, string, or binary')
    }
    return Buffer.from(value)
  }
}
export const payloadService = new PayloadService()
