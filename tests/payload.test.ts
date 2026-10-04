import { describe, it, expect, vi } from 'vitest'
import protobuf from 'protobufjs'
vi.mock('../apps/desktop/src/main/services/schema-service', () => ({
  schemaService: { getSchemaById: vi.fn(), getSchema: vi.fn() }
}))
import { schemaService } from '../apps/desktop/src/main/services/schema-service'
import { PayloadService } from '../apps/desktop/src/main/services/payload-service'
function frame(id: number, index: number[], data: Uint8Array) {
  const header = Buffer.alloc(5)
  header.writeUInt32BE(id, 1)
  return Buffer.concat([header, Buffer.from(index), Buffer.from(data)])
}
describe('payload decoding', () => {
  it('decodes Confluent Protobuf root and nested message indexes', async () => {
    const schema =
      'syntax="proto3"; package demo; message Root { string name=1; message Child { int32 id=1; } }'
    vi.mocked(schemaService.getSchemaById).mockResolvedValue({ schema, schemaType: 'PROTOBUF' })
    const root = protobuf.parse(schema).root
    const service = new PayloadService()
    const top = await service.decode(
      'proto',
      frame(10, [0], root.lookupType('demo.Root').encode({ name: 'hi' }).finish())
    )
    expect(JSON.parse(top.value)).toEqual({ name: 'hi' })
    const nested = await service.decode(
      'proto',
      frame(10, [4, 0, 0], root.lookupType('demo.Root.Child').encode({ id: 7 }).finish())
    )
    expect(JSON.parse(nested.value)).toEqual({ id: 7 })
  })
  it('uses main schema index order ahead of referenced types', async () => {
    const main =
      'syntax="proto3"; package p; import "common.proto"; message Main { Shared shared=1; }'
    const ref = 'syntax="proto3"; package p; message Shared { string name=1; }'
    vi.mocked(schemaService.getSchemaById).mockImplementation(async (_, id) =>
      id === 11
        ? {
            schema: main,
            schemaType: 'PROTOBUF',
            references: [{ name: 'common.proto', subject: 'shared', version: 1 }]
          }
        : { schema: ref, schemaType: 'PROTOBUF' }
    )
    vi.mocked(schemaService.getSchema).mockResolvedValue({
      id: 12,
      schema: ref,
      subject: 'shared',
      version: 1,
      schemaType: 'PROTOBUF'
    })
    const root = new protobuf.Root()
    protobuf.parse(main, root)
    protobuf.parse(ref, root)
    root.resolveAll()
    const result = await new PayloadService().decode(
      'refs',
      frame(
        11,
        [0],
        root
          .lookupType('p.Main')
          .encode({ shared: { name: 'ref' } })
          .finish()
      )
    )
    expect(JSON.parse(result.value)).toEqual({ shared: { name: 'ref' } })
  })
  it('returns inspectable binary and original bytes on missing schema', async () => {
    vi.mocked(schemaService.getSchemaById).mockRejectedValue(new Error('Registry unavailable'))
    const buffer = frame(999, [1], new Uint8Array([255]))
    const result = await new PayloadService().decode('fail', buffer)
    expect(result.format).toBe('binary')
    expect(result.error).toBe('Registry unavailable')
    expect(Buffer.from(result.raw!, 'base64')).toEqual(buffer)
  })
})
