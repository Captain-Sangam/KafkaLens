import { useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import { useConfirmation } from '@/components/common/ConfirmationDialog'
import { Button, Input, Select } from '@/components/common/Controls'
import { AIMarkdown } from '@/components/common/AIMarkdown'
import { download } from '@/lib/files'
import { useRefresh } from '@/lib/useRefresh'
import type { SchemaVersion, SchemaDefinition } from '@/types'
function pretty(schema: string) {
  try {
    return JSON.stringify(JSON.parse(schema), null, 2)
  } catch {
    return schema
  }
}
export default function SchemaRegistry() {
  const { activeClusterId, clusters } = useClusterStore()
  const { schemaSubjects, schemasLoading, fetchSchemaSubjects } = useDataStore()
  const notify = useUIStore((s) => s.addNotification)
  const { confirm, dialog } = useConfirmation()
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [version, setVersion] = useState<number | string>('latest')
  const [compare, setCompare] = useState<number | string>('')
  const [schema, setSchema] = useState<SchemaVersion | null>(null)
  const [before, setBefore] = useState<SchemaVersion | null>(null)
  const [id, setId] = useState('')
  const [lookup, setLookup] = useState<SchemaDefinition | null>(null)
  const [draft, setDraft] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [type, setType] = useState<'AVRO' | 'JSON' | 'PROTOBUF'>('AVRO')
  const [register, setRegister] = useState(false)
  const [compatible, setCompatible] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [ai, setAI] = useState('')
  const [error, setError] = useState('')
  const production = clusters.find((c) => c.id === activeClusterId)?.environmentLabel === 'prod'
  const selected = schemaSubjects.find((s) => s.subject === subject)
  function refresh() {
    if (activeClusterId) void fetchSchemaSubjects(activeClusterId)
  }
  useRefresh(refresh)
  useEffect(() => {
    setSubject('')
    setSchema(null)
    setBefore(null)
    setLookup(null)
    refresh()
  }, [activeClusterId])
  useEffect(() => {
    let alive = true
    setSchema(null)
    setError('')
    setAI('')
    if (activeClusterId && subject)
      void window.api.schema.get(activeClusterId, subject, version).then((r) => {
        if (alive) {
          if (r.success) setSchema(r.data ?? null)
          else setError(r.error ?? 'Could not load schema')
        }
      })
    return () => {
      alive = false
    }
  }, [activeClusterId, subject, version, schemaSubjects])
  useEffect(() => {
    let alive = true
    setBefore(null)
    if (activeClusterId && subject && compare)
      void window.api.schema.get(activeClusterId, subject, Number(compare)).then((r) => {
        if (alive && r.success) setBefore(r.data ?? null)
      })
    return () => {
      alive = false
    }
  }, [activeClusterId, subject, compare])
  const filtered = useMemo(
    () =>
      schemaSubjects.filter((s) =>
        `${s.subject} ${s.schema ?? ''}`.toLowerCase().includes(search.toLowerCase())
      ),
    [schemaSubjects, search]
  )
  async function byId() {
    if (!activeClusterId || !/^\d+$/.test(id)) return
    const r = await window.api.schema.getById(activeClusterId, Number(id))
    if (r.success) setLookup(r.data ?? null)
    else notify('error', r.error ?? 'Schema ID not found')
  }
  async function check() {
    if (!activeClusterId) return
    setBusy(true)
    setError('')
    const existing = schemaSubjects.some((s) => s.subject === newSubject)
    const r = existing
      ? await window.api.schema.checkCompatibility(activeClusterId, newSubject, draft, type)
      : { success: true, data: { is_compatible: true } }
    setBusy(false)
    if (r.success) setCompatible(r.data?.is_compatible ?? false)
    else {
      setCompatible(null)
      setError(r.error ?? 'Could not check compatibility')
    }
  }
  async function save() {
    if (!activeClusterId || !compatible) return
    setBusy(true)
    const r = await window.api.schema.register(activeClusterId, newSubject, draft, type)
    setBusy(false)
    if (r.success) {
      setRegister(false)
      setSubject(newSubject)
      setVersion('latest')
      refresh()
      notify('success', `Registered schema ID ${r.data?.id}`)
    } else setError(r.error ?? 'Registration failed')
  }
  async function remove() {
    if (
      !activeClusterId ||
      !schema ||
      !(await confirm({
        title: 'Delete schema version',
        message: `Delete ${subject} v${schema.version}? Stored messages can still refer to this schema. Verify all producers and consumers have migrated. The Registry rejects schemas referenced by other versions.`,
        resource: subject,
        production
      }))
    )
      return
    setBusy(true)
    const r = await window.api.schema.deleteVersion(activeClusterId, subject, schema.version)
    setBusy(false)
    if (r.success) {
      setSchema(null)
      setVersion('latest')
      setCompare('')
      refresh()
    } else notify('error', r.error ?? 'Could not delete schema')
  }
  async function explain() {
    if (!before || !schema) return
    setBusy(true)
    const r = await window.api.ai.explainSchemaDiff(subject, before.schema, schema.schema)
    setBusy(false)
    if (r.success) setAI(r.data?.content ?? '')
    else notify('error', r.error ?? 'AI explanation failed')
  }
  return (
    <div className="p-6 space-y-4 h-full overflow-auto">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Schema Registry</h1>
        <Button disabled={schemasLoading} onClick={refresh}>
          Refresh
        </Button>
        <Button
          onClick={() => {
            setRegister(true)
            setNewSubject(subject)
            setDraft(schema?.schema ?? '')
            setType(schema?.schemaType ?? 'AVRO')
            setCompatible(null)
            setError('')
          }}
        >
          Register schema
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Search schemas"
          className="flex-1"
          placeholder="Search subjects and field names…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Input
          aria-label="Schema ID"
          placeholder="Schema ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <Button onClick={byId}>Look up ID</Button>
      </div>
      {schemasLoading && (
        <p role="status" className="animate-pulse">
          Loading schema metadata…
        </p>
      )}
      {lookup && (
        <div className="p-3 border border-border rounded">
          <Button onClick={() => setLookup(null)}>Close ID lookup</Button>
          <pre className="text-xs whitespace-pre-wrap mt-2">{pretty(lookup.schema)}</pre>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          {filtered.map((s) => (
            <button
              key={s.subject}
              onClick={() => {
                setSubject(s.subject)
                setVersion('latest')
                setCompare('')
              }}
              className={`text-left w-full rounded p-3 text-xs ${subject === s.subject ? 'bg-accent/15' : 'bg-surface-2'}`}
            >
              <strong className="font-mono">{s.subject}</strong>
              <p className="text-text-muted mt-1">
                {s.schemaType} · {s.versions.length} versions · {s.compatibility} · latest v
                {s.latestVersion}
              </p>
              {s.error && <p className="text-danger">{s.error}</p>}
            </button>
          ))}
          {!schemasLoading && !filtered.length && (
            <p className="text-text-muted text-sm">No schemas match.</p>
          )}
        </div>
        <section className="space-y-3">
          {selected && (
            <>
              <h2 className="font-semibold">{subject}</h2>
              <div className="flex gap-2 flex-wrap">
                <Select
                  aria-label="Schema version"
                  value={version}
                  onChange={(e) => setVersion(Number(e.target.value))}
                >
                  <option value="latest">Latest</option>
                  {selected.versions.map((v) => (
                    <option key={v} value={v}>
                      v{v}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Compare schema version"
                  value={compare}
                  onChange={(e) => setCompare(e.target.value)}
                >
                  <option value="">Compare with…</option>
                  {selected.versions.map((v) => (
                    <option key={v} value={v}>
                      v{v}
                    </option>
                  ))}
                </Select>
                <Button disabled={!schema || busy} onClick={remove} className="text-danger">
                  Delete version
                </Button>
                <Button
                  disabled={!schema}
                  onClick={() =>
                    download(`${subject}-v${schema?.version}.schema`, schema!.schema, 'text/plain')
                  }
                >
                  Export
                </Button>
              </div>
            </>
          )}
          {error && !register && (
            <p role="alert" className="text-danger text-xs">
              {error}
            </p>
          )}
          {schema && (
            <>
              <p className="text-xs text-text-muted">
                ID {schema.id} · {schema.schemaType} · v{schema.version}
              </p>
              {before ? (
                <div>
                  <Button disabled={busy} onClick={explain}>
                    Explain diff with AI
                  </Button>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {[false, true].map((after) => (
                      <div key={String(after)}>
                        <p className="text-xs mb-2">v{after ? schema.version : before.version}</p>
                        <pre className="text-xs overflow-auto rounded bg-surface-1 p-3">
                          {diffLines(pretty(before.schema), pretty(schema.schema))
                            .filter((d) => (after ? !d.removed : !d.added))
                            .map((d, i) => (
                              <span
                                key={i}
                                className={`block ${d.added ? 'bg-success/10 text-success' : d.removed ? 'bg-danger/10 text-danger' : ''}`}
                              >
                                {d.value}
                              </span>
                            ))}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <pre className="text-xs whitespace-pre-wrap bg-surface-1 p-3 rounded">
                  {pretty(schema.schema)}
                </pre>
              )}
              {ai && <AIMarkdown content={ai} />}
            </>
          )}
        </section>
      </div>
      {register && (
        <div className="fixed inset-0 z-50 flex justify-center items-center bg-black/70">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Register schema"
            className="rounded-xl border border-border bg-surface-1 p-6 w-[650px] space-y-4"
          >
            <h2 className="font-semibold">Register schema</h2>
            <p className="text-xs text-warning">
              Registration creates a version used by producers and consumers. Check compatibility
              and verify the subject before proceeding.
            </p>
            <Input
              aria-label="Schema subject"
              value={newSubject}
              onChange={(e) => {
                setNewSubject(e.target.value)
                setCompatible(null)
              }}
              placeholder="Subject"
            />
            <Select
              aria-label="Schema type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type)
                setCompatible(null)
              }}
            >
              {['AVRO', 'PROTOBUF', 'JSON'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <textarea
              aria-label="Schema definition"
              className="w-full h-64 rounded bg-surface-0 border border-border p-3 font-mono text-xs"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setCompatible(null)
              }}
            />
            {compatible !== null && (
              <p className={compatible ? 'text-success' : 'text-danger'}>
                {compatible
                  ? 'Compatible with subject rules'
                  : 'Incompatible — change the schema before registering'}
              </p>
            )}
            {error && (
              <p role="alert" className="text-danger text-xs">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button disabled={busy || !draft || !newSubject} onClick={check}>
                Check compatibility
              </Button>
              <Button disabled={busy || compatible !== true} onClick={save}>
                Register
              </Button>
              <Button onClick={() => setRegister(false)}>Cancel</Button>
            </div>
          </section>
        </div>
      )}
      {dialog}
    </div>
  )
}
