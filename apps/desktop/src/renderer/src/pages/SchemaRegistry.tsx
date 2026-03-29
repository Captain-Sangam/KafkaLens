import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search,
  Database,
  ChevronDown,
  Sparkles,
  ArrowLeftRight,
  Plus,
  Trash2,
  Loader2,
  X,
} from 'lucide-react'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import { MOCK_SCHEMA_SUBJECTS, getMockSchemaVersion } from '@/lib/mock-data'
import type { SchemaSubject, SchemaVersion } from '@/types'

const TYPE_STYLES: Record<SchemaSubject['schemaType'], string> = {
  AVRO: 'bg-info/15 text-info',
  PROTOBUF: 'bg-success/15 text-success',
  JSON: 'bg-warning/15 text-warning',
}

const COMPAT_STYLES: Record<string, string> = {
  BACKWARD: 'bg-success/10 text-success',
  FORWARD: 'bg-info/10 text-info',
  FULL: 'bg-accent/15 text-accent',
  NONE: 'bg-surface-4 text-text-muted',
  BACKWARD_TRANSITIVE: 'bg-success/10 text-success',
  FORWARD_TRANSITIVE: 'bg-info/10 text-info',
  FULL_TRANSITIVE: 'bg-accent/15 text-accent',
}

function syntaxHighlight(json: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /("(?:\\.|[^"\\])*")\s*:?|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(json)) !== null) {
    if (match.index > lastIndex) {
      parts.push(json.slice(lastIndex, match.index))
    }
    const full = match[0]
    if (match[1]) {
      if (full.endsWith(':')) {
        parts.push(
          <span key={match.index} className="text-info">{full.slice(0, -1)}</span>,
          ':',
        )
      } else {
        parts.push(<span key={match.index} className="text-success">{full}</span>)
      }
    } else if (match[2]) {
      parts.push(<span key={match.index} className="text-warning">{full}</span>)
    } else if (match[3]) {
      parts.push(<span key={match.index} className="text-accent">{full}</span>)
    }
    lastIndex = match.index + full.length
  }
  if (lastIndex < json.length) parts.push(json.slice(lastIndex))
  return <>{parts}</>
}

function formatJson(raw: string): React.ReactNode {
  try {
    return syntaxHighlight(JSON.stringify(JSON.parse(raw), null, 2))
  } catch {
    return raw
  }
}

function SchemaCodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="flex flex-col flex-1 min-w-0">
      {label && (
        <div className="text-xs text-text-muted px-3 py-1.5 bg-surface-3 border-b border-border rounded-t-lg">
          {label}
        </div>
      )}
      <pre
        className={`flex-1 overflow-auto bg-surface-1 p-4 text-xs font-mono text-text-secondary leading-relaxed ${
          label ? 'rounded-b-lg' : 'rounded-lg'
        }`}
      >
        {formatJson(code)}
      </pre>
    </div>
  )
}

function RegisterSchemaModal({
  subject,
  onClose,
  onRegistered,
}: {
  subject: string
  onClose: () => void
  onRegistered: () => void
}) {
  const [schemaText, setSchemaText] = useState('')
  const [schemaType, setSchemaType] = useState<'AVRO' | 'PROTOBUF' | 'JSON'>('AVRO')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { activeClusterId, demoMode } = useClusterStore()
  const addNotification = useUIStore((s) => s.addNotification)

  const handleSubmit = async () => {
    if (!schemaText.trim()) {
      setError('Schema cannot be empty')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      if (demoMode) {
        await new Promise((r) => setTimeout(r, 500))
        addNotification('success', `Registered new version for ${subject}`)
        onRegistered()
        onClose()
        return
      }

      const res = await window.api.schema.register(activeClusterId!, subject, schemaText, schemaType)
      if (res.success) {
        addNotification('success', `Registered new version (id: ${res.data?.id}) for ${subject}`)
        onRegistered()
        onClose()
      } else {
        setError(res.error ?? 'Registration failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex w-full max-w-xl flex-col rounded-xl border border-border bg-surface-0 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Register New Schema Version</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-3 hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-text-muted">
            Subject: <span className="font-mono text-text-primary">{subject}</span>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">Schema Type</label>
            <div className="flex gap-2">
              {(['AVRO', 'PROTOBUF', 'JSON'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSchemaType(t)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    schemaType === t ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">Schema Definition</label>
            <textarea
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
              placeholder={`Paste your ${schemaType} schema here...`}
              rows={12}
              className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md bg-surface-3 text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            Register
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteVersionDialog({
  subject,
  version,
  onClose,
  onDeleted,
}: {
  subject: string
  version: number
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const { activeClusterId, demoMode } = useClusterStore()
  const addNotification = useUIStore((s) => s.addNotification)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      if (demoMode) {
        await new Promise((r) => setTimeout(r, 400))
        addNotification('success', `Deleted version ${version} of ${subject}`)
        onDeleted()
        onClose()
        return
      }

      const res = await window.api.schema.deleteVersion(activeClusterId!, subject, version)
      if (res.success) {
        addNotification('success', `Deleted version ${version} of ${subject}`)
        onDeleted()
        onClose()
      } else {
        addNotification('error', res.error ?? 'Failed to delete version')
      }
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Failed to delete version')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-surface-0 shadow-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Delete Schema Version</h3>
        <p className="text-xs text-text-secondary">
          Are you sure you want to delete version <strong>v{version}</strong> of{' '}
          <span className="font-mono">{subject}</span>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md bg-surface-3 text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-danger text-white hover:bg-danger/90 transition-colors disabled:opacity-50"
          >
            {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function SchemaDetail({
  subject,
  onRefresh,
}: {
  subject: SchemaSubject
  onRefresh: () => void
}) {
  const { activeClusterId, demoMode } = useClusterStore()
  const addNotification = useUIStore((s) => s.addNotification)

  const [versions, setVersions] = useState<number[]>(subject.versions)
  const [selectedVersion, setSelectedVersion] = useState(subject.latestVersion)
  const [schema, setSchema] = useState<SchemaVersion | null>(null)
  const [prevSchema, setPrevSchema] = useState<SchemaVersion | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [loadingSchema, setLoadingSchema] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [aiExplanation, setAiExplanation] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const fetchVersions = useCallback(async () => {
    if (demoMode) {
      const mock = MOCK_SCHEMA_SUBJECTS.find((s) => s.subject === subject.subject)
      setVersions(mock?.versions ?? subject.versions)
      return
    }
    try {
      const res = await window.api.schema.versions(activeClusterId!, subject.subject)
      if (res.success && res.data) setVersions(res.data)
    } catch {
      // keep existing versions
    }
  }, [activeClusterId, demoMode, subject.subject, subject.versions])

  const fetchSchema = useCallback(async (version: number) => {
    setLoadingSchema(true)
    try {
      if (demoMode) {
        await new Promise((r) => setTimeout(r, 150))
        setSchema(getMockSchemaVersion(subject.subject, version))
        setLoadingSchema(false)
        return
      }
      const res = await window.api.schema.get(activeClusterId!, subject.subject, version)
      if (res.success && res.data) {
        setSchema(res.data as SchemaVersion)
      }
    } catch {
      if (demoMode) setSchema(getMockSchemaVersion(subject.subject, version))
    } finally {
      setLoadingSchema(false)
    }
  }, [activeClusterId, demoMode, subject.subject])

  const fetchPrevSchema = useCallback(async (version: number) => {
    if (version <= 1) { setPrevSchema(null); return }
    try {
      if (demoMode) {
        setPrevSchema(getMockSchemaVersion(subject.subject, version - 1))
        return
      }
      const res = await window.api.schema.get(activeClusterId!, subject.subject, version - 1)
      if (res.success && res.data) setPrevSchema(res.data as SchemaVersion)
    } catch {
      if (demoMode) setPrevSchema(getMockSchemaVersion(subject.subject, version - 1))
    }
  }, [activeClusterId, demoMode, subject.subject])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  useEffect(() => {
    fetchSchema(selectedVersion)
    fetchPrevSchema(selectedVersion)
    setAiExplanation(null)
  }, [selectedVersion, fetchSchema, fetchPrevSchema])

  const hasDiff = versions.length >= 2

  const handleAiExplain = async () => {
    if (!schema || !prevSchema) return
    setAiLoading(true)
    setAiExplanation(null)
    try {
      if (demoMode) {
        await new Promise((r) => setTimeout(r, 1200))
        setAiExplanation(
          `**Schema Diff Analysis for ${subject.subject}**\n\n` +
          `Version ${prevSchema.version} → ${schema.version}:\n\n` +
          `• New optional field \`metadata\` added (backward compatible)\n` +
          `• The field uses a union type [\`null\`, \`map<string>\`] with a null default, ensuring existing consumers won't break\n` +
          `• This change follows BACKWARD compatibility — old readers can ignore the new field\n\n` +
          `**Risk Assessment:** Low — this is a safe additive change.`
        )
        return
      }
      const res = await window.api.ai.explainSchemaDiff(subject.subject, prevSchema.schema, schema.schema)
      if (res.success && res.data) {
        setAiExplanation(res.data.content)
      } else {
        addNotification('error', res.error ?? 'AI explanation failed')
      }
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'AI explanation failed')
    } finally {
      setAiLoading(false)
    }
  }

  const handleRegistered = () => {
    fetchVersions()
    onRefresh()
  }

  const handleDeleted = () => {
    const remaining = versions.filter((v) => v !== deleteTarget)
    setVersions(remaining)
    if (selectedVersion === deleteTarget && remaining.length > 0) {
      setSelectedVersion(remaining[remaining.length - 1])
    }
    setDeleteTarget(null)
    onRefresh()
  }

  return (
    <div className="flex flex-col h-full animate-slide-in">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-sm font-semibold text-text-primary truncate">
            {subject.subject}
          </h2>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${COMPAT_STYLES[subject.compatibility]}`}>
            {subject.compatibility}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">Version</label>
            <div className="relative">
              <select
                value={selectedVersion}
                onChange={(e) => {
                  setSelectedVersion(Number(e.target.value))
                  setShowDiff(false)
                }}
                className="appearance-none bg-surface-2 border border-border rounded-md pl-3 pr-7 py-1 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
              >
                {versions.map((v) => (
                  <option key={v} value={v}>
                    v{v} {v === Math.max(...versions) ? '(latest)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
            </div>
          </div>

          <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[subject.schemaType]}`}>
            {subject.schemaType}
          </span>

          {hasDiff && (
            <button
              onClick={() => setShowDiff(!showDiff)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                showDiff
                  ? 'bg-accent/15 text-accent'
                  : 'bg-surface-3 text-text-secondary hover:text-text-primary hover:bg-surface-4'
              }`}
            >
              <ArrowLeftRight className="w-3 h-3" />
              Diff Versions
            </button>
          )}

          {showDiff && prevSchema && (
            <button
              onClick={handleAiExplain}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-surface-3 text-text-secondary hover:text-text-primary hover:bg-surface-4 transition-colors disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Explain with AI
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setDeleteTarget(selectedVersion)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete v{selectedVersion}
            </button>
            <button
              onClick={() => setShowRegister(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Register New Version
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {loadingSchema ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          </div>
        ) : schema ? (
          <>
            {showDiff && prevSchema ? (
              <div className="flex gap-3 h-64">
                <SchemaCodeBlock code={prevSchema.schema} label={`v${prevSchema.version}`} />
                <SchemaCodeBlock code={schema.schema} label={`v${schema.version}`} />
              </div>
            ) : (
              <SchemaCodeBlock code={schema.schema} />
            )}

            {aiExplanation && (
              <div className="bg-surface-2 border border-accent/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <h4 className="text-xs font-medium text-accent">AI Diff Analysis</h4>
                </div>
                <div className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {aiExplanation}
                </div>
              </div>
            )}

            {aiLoading && (
              <div className="bg-surface-2 border border-border rounded-lg p-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span className="text-xs text-text-muted">Analyzing schema differences...</span>
              </div>
            )}
          </>
        ) : null}
      </div>

      {showRegister && (
        <RegisterSchemaModal
          subject={subject.subject}
          onClose={() => setShowRegister(false)}
          onRegistered={handleRegistered}
        />
      )}

      {deleteTarget !== null && (
        <DeleteVersionDialog
          subject={subject.subject}
          version={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}

export default function SchemaRegistry() {
  const { activeClusterId } = useClusterStore()
  const { schemaSubjects, schemasLoading, fetchSchemaSubjects } = useDataStore()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SchemaSubject | null>(null)

  useEffect(() => {
    if (activeClusterId) fetchSchemaSubjects(activeClusterId)
  }, [activeClusterId, fetchSchemaSubjects])

  const filtered = useMemo(
    () =>
      schemaSubjects.filter((s) =>
        s.subject.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, schemaSubjects],
  )

  const handleRefresh = () => {
    if (activeClusterId) fetchSchemaSubjects(activeClusterId)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <Database className="w-5 h-5 text-accent" />
        <h1 className="text-lg font-semibold text-text-primary">Schema Registry</h1>
        <span className="text-xs bg-surface-3 text-text-muted px-2 py-0.5 rounded-full">
          {schemasLoading ? (
            <Loader2 className="w-3 h-3 animate-spin inline" />
          ) : (
            `${schemaSubjects.length} subjects`
          )}
        </span>
      </div>

      <div className="px-6 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Filter subjects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-1 border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-border overflow-auto">
          {schemasLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-1">
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2.5 px-4 font-medium">Subject</th>
                  <th className="text-left py-2.5 px-4 font-medium">Type</th>
                  <th className="text-right py-2.5 px-4 font-medium">Versions</th>
                  <th className="text-left py-2.5 px-4 font-medium">Compat</th>
                  <th className="text-right py-2.5 px-4 font-medium">Latest</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.subject}
                    onClick={() => setSelected(s)}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${
                      selected?.subject === s.subject
                        ? 'bg-accent/10'
                        : 'hover:bg-surface-2/60'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono text-text-primary truncate max-w-[200px]">
                      {s.subject}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[s.schemaType]}`}>
                        {s.schemaType}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-text-secondary">
                      {s.versions.length}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${COMPAT_STYLES[s.compatibility]}`}>
                        {s.compatibility}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-text-secondary">
                      v{s.latestVersion}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-text-muted">
                      No subjects match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="w-1/2 overflow-hidden">
          {selected ? (
            <SchemaDetail key={selected.subject} subject={selected} onRefresh={handleRefresh} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Select a subject to view its schema
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
