import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  FlaskConical,
  Save,
  Eye,
  EyeOff,
  X,
  Shield,
  Monitor,
  Keyboard,
  Sparkles,
  Server,
  Check,
  Loader2,
  Download,
  Upload,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import { useClusterStore } from '@/stores/clusterStore'
import { useUIStore } from '@/stores/uiStore'
import { ENV_COLORS } from '@/types'
import { Button } from '@/components/common/Controls'
import { AIMarkdown } from '@/components/common/AIMarkdown'
import { useConfirmation } from '@/components/common/ConfirmationDialog'
import type { UpdateState, AIHistoryEntry } from '@/types'
import { exportCluster } from '@/lib/files'
import type { ClusterConfig, AIProvider, AISettings, AuthMethod, EnvironmentLabel } from '@/types'

const AUTH_OPTIONS: { value: AuthMethod; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'sasl-plain', label: 'SASL/PLAIN' },
  { value: 'sasl-scram-256', label: 'SASL/SCRAM-256' },
  { value: 'sasl-scram-512', label: 'SASL/SCRAM-512' },
  { value: 'ssl', label: 'SSL Client Certificate' }
]

const ENV_OPTIONS: { value: EnvironmentLabel; label: string }[] = [
  { value: 'local', label: 'Local' },
  { value: 'dev', label: 'Dev' },
  { value: 'staging', label: 'Staging' },
  { value: 'prod', label: 'Prod' }
]

const ENV_DOT_COLORS: Record<EnvironmentLabel, string> = {
  local: 'bg-indigo-500',
  dev: 'bg-green-500',
  staging: 'bg-amber-500',
  prod: 'bg-red-500'
}

const PROVIDER_OPTIONS: { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google Gemini' }
]

const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3.5-sonnet', 'claude-3-haiku'],
  google: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
}

const PROVIDER_KEY_PLACEHOLDER: Record<AIProvider, string> = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  google: 'AIza...'
}

const FONT_SIZE_MAP = { small: '13px', medium: '14px', large: '16px' } as const

const SHORTCUTS = [
  { keys: '⌘K', description: 'Command Palette' },
  { keys: '⌘1-7', description: 'Navigate to pages' },
  { keys: '⌘R', description: 'Refresh' },
  { keys: '⌘T', description: 'Quick topic search' },
  { keys: '⌘,', description: 'Settings' }
]

const inputClasses =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none'
const selectClasses =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none'

interface ClusterFormState {
  name: string
  bootstrapServers: string
  environmentLabel: EnvironmentLabel
  authMethod: AuthMethod
  ssl: boolean
  sslRejectUnauthorized: boolean
  username: string
  password: string
  schemaRegistryUrl: string
  registryUsername: string
  registryPassword: string
  sslCertPath: string
  sslClientCertPath: string
  sslKeyPath: string
  colorTag: string
}

const EMPTY_FORM: ClusterFormState = {
  name: '',
  bootstrapServers: '',
  environmentLabel: 'local',
  authMethod: 'none',
  ssl: false,
  sslRejectUnauthorized: true,
  username: '',
  password: '',
  schemaRegistryUrl: '',
  registryUsername: '',
  registryPassword: '',
  sslCertPath: '',
  sslClientCertPath: '',
  sslKeyPath: '',
  colorTag: ENV_COLORS.local
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-3">
      <Icon size={18} className="text-accent" />
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. Cluster Management
// ---------------------------------------------------------------------------

function ClusterManagementSection() {
  const {
    clusters,
    activeClusterId,
    addCluster,
    updateCluster,
    removeCluster,
    testConnection,
    connectCluster
  } = useClusterStore()
  const addNotification = useUIStore((s) => s.addNotification)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ClusterFormState>(EMPTY_FORM)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ClusterConfig | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

  const importRef = useRef<HTMLInputElement>(null)

  const isSasl = form.authMethod.startsWith('sasl')

  function buildConfig(): ClusterConfig {
    return {
      id: editingId ?? crypto.randomUUID(),
      name: form.name,
      bootstrapServers: form.bootstrapServers,
      authMethod: form.authMethod,
      ssl: form.ssl,
      sslRejectUnauthorized: form.sslRejectUnauthorized,
      environmentLabel: form.environmentLabel,
      colorTag: form.colorTag,
      sslCertPath: form.sslCertPath || undefined,
      sslClientCertPath: form.sslClientCertPath || undefined,
      sslKeyPath: form.sslKeyPath || undefined,
      schemaRegistryAuth: form.registryUsername
        ? { username: form.registryUsername, password: form.registryPassword }
        : undefined,
      schemaRegistryUrl: form.schemaRegistryUrl || undefined,
      username: isSasl ? form.username : undefined,
      password: isSasl ? form.password : undefined,
      createdAt: editingId
        ? (clusters.find((c) => c.id === editingId)?.createdAt ?? Date.now())
        : Date.now(),
      updatedAt: Date.now()
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const config = buildConfig()
      const result = await testConnection(config)
      if (result.success) {
        setTestResult({
          type: 'success',
          message: `Connected — ${result.brokerCount} broker${result.brokerCount !== 1 ? 's' : ''} (Kafka ${result.kafkaVersion ?? 'unknown'})`
        })
      } else {
        setTestResult({ type: 'error', message: result.error ?? 'Connection failed' })
      }
    } catch (err) {
      setTestResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Connection test failed'
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.bootstrapServers.trim()) return
    setSaving(true)
    try {
      const config = buildConfig()
      const tested = await testConnection(config)
      if (!tested.success)
        throw new Error(
          tested.error ?? 'Connection test failed. Check broker settings before saving.'
        )
      if (editingId) {
        const { id: _, createdAt: __, ...updates } = config
        await updateCluster(editingId, updates)
        addNotification('success', `Cluster "${config.name}" updated`)
        if (editingId === activeClusterId) {
          connectCluster(editingId)
        }
      } else {
        await addCluster(config)
        addNotification('success', `Cluster "${config.name}" added`)
      }
      resetForm()
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Failed to save cluster')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditingId(null)
    setTestResult(null)
  }

  function handleEdit(cluster: ClusterConfig) {
    setEditingId(cluster.id)
    setForm({
      name: cluster.name,
      bootstrapServers: cluster.bootstrapServers,
      environmentLabel: cluster.environmentLabel,
      authMethod: cluster.authMethod,
      ssl: cluster.ssl ?? false,
      sslRejectUnauthorized: cluster.sslRejectUnauthorized ?? true,
      username: cluster.username ?? '',
      password: cluster.password ?? '',
      schemaRegistryUrl: cluster.schemaRegistryUrl ?? '',
      registryUsername: cluster.schemaRegistryAuth?.username ?? '',
      registryPassword: cluster.schemaRegistryAuth?.password ?? '',
      sslCertPath: cluster.sslCertPath ?? '',
      sslClientCertPath: cluster.sslClientCertPath ?? '',
      sslKeyPath: cluster.sslKeyPath ?? '',
      colorTag: cluster.colorTag.startsWith('#')
        ? cluster.colorTag
        : ENV_COLORS[cluster.environmentLabel]
    })
    setShowForm(true)
    setTestResult(null)
  }

  function handleDeleteRequest(cluster: ClusterConfig) {
    setDeleteTarget(cluster)
    setDeleteConfirmName('')
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    if (deleteTarget.environmentLabel === 'prod' && deleteConfirmName !== deleteTarget.name) return
    await removeCluster(deleteTarget.id)
    addNotification('success', `Cluster "${deleteTarget.name}" removed`)
    setDeleteTarget(null)
  }

  function handleExport() {
    const exportable = clusters.map(exportCluster)
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kafkalens-clusters-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    addNotification('success', `Exported ${clusters.length} cluster(s)`)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!Array.isArray(data)) throw new Error('Invalid format — expected an array')
        let imported = 0
        for (const item of data) {
          if (!item.name || !item.bootstrapServers) continue
          const config: ClusterConfig = {
            id: crypto.randomUUID(),
            name: item.name,
            bootstrapServers: item.bootstrapServers,
            authMethod: item.authMethod ?? 'none',
            ssl: item.ssl ?? false,
            sslRejectUnauthorized: item.sslRejectUnauthorized ?? true,
            environmentLabel: item.environmentLabel ?? 'local',
            colorTag:
              item.colorTag ??
              ENV_COLORS[item.environmentLabel as EnvironmentLabel] ??
              ENV_COLORS.local,
            sslCertPath: item.sslCertPath,
            sslClientCertPath: item.sslClientCertPath,
            sslKeyPath: item.sslKeyPath,
            schemaRegistryUrl: item.schemaRegistryUrl,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
          await addCluster(config)
          imported++
        }
        addNotification('success', `Imported ${imported} cluster(s)`)
      } catch (err) {
        addNotification('error', err instanceof Error ? err.message : 'Import failed')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <section className="space-y-4">
      <SectionHeader icon={Server} title="Cluster Management" />

      {/* Cluster list */}
      <div className="space-y-2">
        {clusters.map((cluster) => (
          <div
            key={cluster.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${ENV_DOT_COLORS[cluster.environmentLabel]}`}
              />
              <div>
                <div className="text-sm font-medium text-text-primary">{cluster.name}</div>
                <div className="text-xs text-text-muted">
                  {cluster.bootstrapServers}
                  <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase text-text-secondary">
                    {cluster.environmentLabel}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label={`Edit ${cluster.name}`}
                onClick={() => handleEdit(cluster)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
              >
                <Pencil size={13} />
              </button>
              <button
                aria-label={`Duplicate ${cluster.name}`}
                onClick={() => {
                  handleEdit(cluster)
                  setEditingId(null)
                  setForm((f) => ({ ...f, name: f.name + ' copy' }))
                }}
                className="rounded bg-surface-3 px-2 py-1 text-xs"
              >
                Duplicate
              </button>
              <button
                aria-label={`Delete ${cluster.name}`}
                onClick={() => handleDeleteRequest(cluster)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">
                Delete &quot;{deleteTarget.name}&quot;?
              </p>
              <p className="text-xs text-text-muted">
                This will permanently remove the cluster configuration. Active connections will be
                terminated.
              </p>
            </div>
          </div>
          {deleteTarget.environmentLabel === 'prod' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-danger">
                Type the cluster name to confirm:
              </label>
              <input
                aria-label="Type the cluster name to confirm:"
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={deleteTarget.name}
                className={inputClasses}
                autoFocus
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteConfirm}
              disabled={
                deleteTarget.environmentLabel === 'prod' && deleteConfirmName !== deleteTarget.name
              }
              className="flex items-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-xs text-white transition-colors hover:bg-danger/90 disabled:opacity-40"
            >
              <Trash2 size={14} />
              Delete
            </button>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg bg-surface-3 px-4 py-2 text-xs text-text-primary transition-colors hover:bg-surface-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit form */}
      {showForm ? (
        <div className="space-y-4 rounded-lg border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-primary">
              {editingId ? 'Edit Cluster' : 'Add Cluster'}
            </h3>
            <button
              onClick={resetForm}
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Display Name</label>
              <input
                aria-label="Display Name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Cluster"
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Bootstrap Servers</label>
              <input
                aria-label="Bootstrap Servers"
                type="text"
                value={form.bootstrapServers}
                onChange={(e) => setForm((f) => ({ ...f, bootstrapServers: e.target.value }))}
                placeholder="broker1:9092,broker2:9092"
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Environment</label>
              <select
                value={form.environmentLabel}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    environmentLabel: e.target.value as EnvironmentLabel
                  }))
                }
                className={selectClasses}
              >
                {ENV_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Authentication</label>
              <select
                value={form.authMethod}
                onChange={(e) =>
                  setForm((f) => ({ ...f, authMethod: e.target.value as AuthMethod }))
                }
                className={selectClasses}
              >
                {AUTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                <div>
                  <div className="text-sm text-text-primary">SSL/TLS</div>
                  <div className="text-[11px] text-text-muted">Encrypt broker connections</div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ssl: !f.ssl }))}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    form.ssl ? 'bg-accent' : 'bg-surface-4'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      form.ssl ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {form.ssl && (
                <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
                  <div>
                    <div className="text-sm text-text-primary">Skip TLS verification</div>
                    <div className="text-[11px] text-text-muted">
                      Required for port-forwarded or self-signed connections
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, sslRejectUnauthorized: !f.sslRejectUnauthorized }))
                    }
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      !form.sslRejectUnauthorized ? 'bg-warning' : 'bg-surface-4'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        !form.sslRejectUnauthorized ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {isSasl && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">Username</label>
                  <input
                    aria-label="Username"
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="kafka-user"
                    className={inputClasses}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">Password</label>
                  <input
                    aria-label="Password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    className={inputClasses}
                  />
                </div>
              </>
            )}

            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Schema Registry URL <span className="text-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={form.schemaRegistryUrl}
                onChange={(e) => setForm((f) => ({ ...f, schemaRegistryUrl: e.target.value }))}
                placeholder="https://schema-registry:8081"
                className={inputClasses}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs">
              Color tag{' '}
              <input
                aria-label="Cluster color"
                type="color"
                value={form.colorTag}
                onChange={(e) => setForm((f) => ({ ...f, colorTag: e.target.value }))}
              />
            </label>
            {(form.ssl || form.authMethod === 'ssl') &&
              (['sslCertPath', 'sslClientCertPath', 'sslKeyPath'] as const).map((key, i) => (
                <div key={key} className="flex gap-2">
                  <input
                    aria-label={['CA certificate', 'Client certificate', 'Private key'][i]}
                    className={inputClasses}
                    placeholder={
                      ['CA certificate path', 'Client certificate path', 'Private key path'][i]
                    }
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="rounded bg-surface-3 px-3"
                    onClick={async () => {
                      const res = await window.api.app.selectCertificate()
                      if (res.data) setForm((f) => ({ ...f, [key]: res.data! }))
                    }}
                  >
                    Browse
                  </button>
                </div>
              ))}
            {form.schemaRegistryUrl && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Registry username"
                  className={inputClasses}
                  placeholder="Registry username"
                  value={form.registryUsername}
                  onChange={(e) => setForm((f) => ({ ...f, registryUsername: e.target.value }))}
                />
                <input
                  aria-label="Registry password"
                  className={inputClasses}
                  type="password"
                  placeholder="Registry password"
                  value={form.registryPassword}
                  onChange={(e) => setForm((f) => ({ ...f, registryPassword: e.target.value }))}
                />
              </div>
            )}
          </div>
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                testResult.type === 'success'
                  ? 'bg-success/10 text-success'
                  : 'bg-danger/10 text-danger'
              }`}
            >
              {testResult.type === 'success' ? <Check size={14} /> : <X size={14} />}
              {testResult.message}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testing || !form.bootstrapServers.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-4 py-2 text-xs text-text-primary transition-colors hover:bg-surface-4 disabled:opacity-40"
            >
              {testing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FlaskConical size={14} />
              )}
              Test Connection
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.bootstrapServers.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setEditingId(null)
            setForm(EMPTY_FORM)
            setShowForm(true)
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-xs text-text-muted transition-colors hover:border-border-bright hover:bg-surface-1 hover:text-text-secondary"
        >
          <Plus size={14} />
          Add Cluster
        </button>
      )}

      {/* Import / Export */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          disabled={clusters.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-4 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-3 disabled:opacity-40"
        >
          <Download size={14} />
          Export Clusters
        </button>
        <button
          onClick={() => importRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-4 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-3"
        >
          <Upload size={14} />
          Import Clusters
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          onChange={handleImportFile}
          className="hidden"
        />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 2. AI Configuration
// ---------------------------------------------------------------------------

interface AIFormProps {
  settings: AISettings
  setSettings: React.Dispatch<React.SetStateAction<AISettings>>
  showKey: boolean
  setShowKey: React.Dispatch<React.SetStateAction<boolean>>
  savingAI: boolean
  onSave: () => void
}

function AISettingsForm({
  settings,
  setSettings,
  showKey,
  setShowKey,
  savingAI,
  onSave
}: AIFormProps) {
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null)
  const [fetchingModels, setFetchingModels] = useState(false)

  const defaultModels = PROVIDER_MODELS[settings.provider]
  const models = fetchedModels ?? defaultModels

  function handleProviderChange(provider: AIProvider) {
    setFetchedModels(null)
    setSettings((s) => ({
      ...s,
      provider,
      model: PROVIDER_MODELS[provider][0],
      apiKey: s.provider === provider ? s.apiKey : ''
    }))
  }

  async function handleFetchModels() {
    if (!settings.apiKey.trim() || settings.provider !== 'openai') return
    setFetchingModels(true)
    try {
      const res = await window.api.ai.models(settings)
      if (res.success && res.data?.length) {
        setFetchedModels(res.data)
        return
      }
      setFetchedModels(null)
    } catch {
      setFetchedModels(null)
    } finally {
      setFetchingModels(false)
    }
  }

  const providerLabel = PROVIDER_OPTIONS.find((p) => p.value === settings.provider)?.label ?? 'AI'

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-1 p-5">
      {/* Provider selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">AI Provider</label>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {PROVIDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleProviderChange(opt.value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                settings.provider === opt.value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">{providerLabel} API Key</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={settings.apiKey}
            onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
            placeholder={PROVIDER_KEY_PLACEHOLDER[settings.provider]}
            className={`${inputClasses} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <Shield size={10} />
          Your API key is stored in macOS Keychain
        </p>
      </div>

      {/* Model — with fetch button for OpenAI */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">Model</label>
          {settings.provider === 'openai' && (
            <button
              onClick={handleFetchModels}
              disabled={fetchingModels || !settings.apiKey.trim()}
              className="flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors disabled:opacity-40"
            >
              {fetchingModels ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <RefreshCw size={10} />
              )}
              Fetch models
            </button>
          )}
        </div>
        <select
          value={settings.model}
          onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
          className={selectClasses}
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {fetchedModels && (
          <p className="text-[11px] text-success">
            {fetchedModels.length} models loaded from your account
          </p>
        )}
      </div>

      {/* Redacted fields */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Field Redaction</label>
        <input
          aria-label="Field Redaction"
          type="text"
          value={settings.redactedFields.join(', ')}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              redactedFields: e.target.value
                .split(',')
                .map((f) => f.trim())
                .filter(Boolean)
            }))
          }
          placeholder="password, token, ssn, secret"
          className={inputClasses}
        />
        <p className="text-[11px] text-text-muted">
          Comma-separated field patterns to redact before sending to AI
        </p>
      </div>

      {/* Save */}
      <button
        onClick={onSave}
        disabled={savingAI || !settings.apiKey.trim()}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        {savingAI ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Save AI Settings
      </button>
    </div>
  )
}

function AIConfigSection() {
  const addNotification = useUIStore((s) => s.addNotification)

  const [settings, setSettings] = useState<AISettings>({
    enabled: false,
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o',
    redactedFields: ['password', 'token', 'ssn', 'secret'],
    consent: false,
    features: {},
    anomalyThreshold: 1000
  })
  const [showKey, setShowKey] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [savingAI, setSavingAI] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await window.api.settings.getAI()
        if (!cancelled && res.success && res.data) {
          setSettings({
            ...res.data,
            enabled: res.data.enabled,
            provider: res.data.provider,
            apiKey: res.data.apiKey ?? '',
            model: res.data.model,
            redactedFields: res.data.redactedFields ?? []
          })
        }
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSaveAI() {
    setSavingAI(true)
    try {
      if (window.api?.settings?.saveAI) {
        const res = await window.api.settings.saveAI(settings)
        if (!res.success) throw new Error(res.error ?? 'Failed to save AI settings')
      }
      addNotification('success', 'AI settings saved')
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Failed to save AI settings')
    } finally {
      setSavingAI(false)
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader icon={Sparkles} title="AI Configuration" />

      {!loaded ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-4 py-6 text-xs text-text-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading AI settings…
        </div>
      ) : (
        <>
          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-4 py-3">
            <div>
              <div className="text-sm text-text-primary">Enable AI Assistant</div>
              <div className="text-xs text-text-muted">
                AI-powered insights, recommendations, and message explanations
              </div>
            </div>
            <button
              role="switch"
              aria-label="Enable AI assistant"
              aria-checked={settings.enabled}
              onClick={async () => {
                const next = { ...settings, enabled: !settings.enabled }
                setSettings(next)
                if (!next.enabled) {
                  const r = await window.api.settings.saveAI(next)
                  if (!r.success) addNotification('error', r.error ?? 'Could not disable AI')
                }
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                settings.enabled ? 'bg-accent' : 'bg-surface-3'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  settings.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {settings.enabled && (
            <div className="space-y-3 rounded border border-border p-4 text-xs">
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={settings.consent ?? false}
                  onChange={(e) => setSettings((s) => ({ ...s, consent: e.target.checked }))}
                />
                I consent to sending selected payloads and configuration to my AI provider.
                Redaction applies before transmission.
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={settings.historyEnabled ?? false}
                  onChange={(e) => setSettings((s) => ({ ...s, historyEnabled: e.target.checked }))}
                />
                Save the last 50 AI responses locally. Inputs are never saved. Clear saved responses
                below.
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  ['messages', 'dlq', 'topics', 'schemas', 'health', 'search', 'anomalies'] as const
                ).map((feature) => (
                  <label key={feature} className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={
                        feature === 'anomalies'
                          ? settings.features?.[feature] === true
                          : settings.features?.[feature] !== false
                      }
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          features: { ...s.features, [feature]: e.target.checked }
                        }))
                      }
                    />
                    {feature}
                  </label>
                ))}
              </div>
              <label>
                Lag growth threshold (messages per minute){' '}
                <input
                  aria-label="Lag growth threshold"
                  type="number"
                  min={1}
                  className={inputClasses}
                  value={settings.anomalyThreshold ?? 1000}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, anomalyThreshold: Number(e.target.value) }))
                  }
                />
              </label>
            </div>
          )}
          {!settings.enabled && (
            <button
              onClick={() => void handleSaveAI()}
              className="rounded bg-accent px-4 py-2 text-white"
            >
              Save AI disabled
            </button>
          )}
          {settings.enabled && (
            <AISettingsForm
              settings={settings}
              setSettings={setSettings}
              showKey={showKey}
              setShowKey={setShowKey}
              savingAI={savingAI}
              onSave={handleSaveAI}
            />
          )}
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 3. Display
// ---------------------------------------------------------------------------

function DisplaySection() {
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>(() => {
    const current = document.documentElement.style.getPropertyValue('--app-font-size')
    if (current === FONT_SIZE_MAP.small) return 'small'
    if (current === FONT_SIZE_MAP.large) return 'large'
    return 'medium'
  })

  const applyFontSize = useCallback((size: 'small' | 'medium' | 'large') => {
    setFontSize(size)
    document.documentElement.style.setProperty('--app-font-size', FONT_SIZE_MAP[size])
    void window.api.settings
      .get('display')
      .then((res) =>
        window.api.settings.set(
          'display',
          JSON.stringify({ ...(res.data ? JSON.parse(res.data) : {}), fontSize: size })
        )
      )
  }, [])

  const [patterns, setPatterns] = useState('.dlq,-dlq,.DLT,-dlt,.retry,-retry,-error')
  useEffect(() => {
    void window.api.settings.get('display').then((res) => {
      if (res.data) {
        try {
          const p = JSON.parse(res.data)
          if (['small', 'medium', 'large'].includes(p.fontSize)) setFontSize(p.fontSize)
          if (Array.isArray(p.dlqPatterns))
            setPatterns(p.dlqPatterns.filter((v: unknown) => typeof v === 'string').join(','))
        } catch {
          useUIStore
            .getState()
            .addNotification(
              'warning',
              'Display preferences could not be read. Save them again in Settings.'
            )
        }
      }
    })
  }, [])
  return (
    <section className="space-y-4">
      <label className="block text-sm">
        DLQ topic patterns (comma separated substrings)
        <input
          aria-label="DLQ patterns"
          className={inputClasses}
          value={patterns}
          onChange={(e) => setPatterns(e.target.value)}
        />
      </label>
      <button
        className="rounded bg-surface-3 px-3 py-2 text-xs"
        onClick={() =>
          void window.api.settings.set(
            'display',
            JSON.stringify({
              fontSize,
              dlqPatterns: patterns
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean)
            })
          )
        }
      >
        Save detection patterns
      </button>
      <SectionHeader icon={Monitor} title="Display" />

      <div className="space-y-3 rounded-lg border border-border bg-surface-1 p-5">
        {/* Font size */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-text-primary">Font Size</div>
            <div className="text-xs text-text-muted">Adjust the UI text size</div>
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => applyFontSize(size)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  fontSize === size
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between border-t border-border pt-3 text-sm">
          <span>Appearance</span>
          <span className="text-text-secondary">Dark</span>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 4. Keyboard Shortcuts
// ---------------------------------------------------------------------------

function ShortcutsSection() {
  return (
    <section className="space-y-4">
      <SectionHeader icon={Keyboard} title="Keyboard Shortcuts" />

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-left text-text-muted">
              <th className="px-4 py-2.5 font-medium">Shortcut</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((shortcut) => (
              <tr
                key={shortcut.keys}
                className="border-b border-border/50 transition-colors hover:bg-surface-1"
              >
                <td className="px-4 py-2.5">
                  <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-text-primary">
                    {shortcut.keys}
                  </kbd>
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{shortcut.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export function Settings() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
        <p className="mt-0.5 text-xs text-text-muted">
          Manage clusters, AI configuration, and preferences
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-8 px-6 py-6">
          <ClusterManagementSection />
          <AIConfigSection />
          <DisplaySection />
          <ShortcutsSection />
          <AIHistorySection />
          <UpdateSection />
        </div>
      </div>
    </div>
  )
}

function AIHistorySection() {
  const [entries, setEntries] = useState<AIHistoryEntry[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const { confirm, dialog } = useConfirmation()
  useEffect(() => {
    let alive = true
    void window.api.ai.history().then((r) => {
      if (alive && r.success) setEntries(r.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [])
  return (
    <section className="space-y-3">
      <SectionHeader icon={Sparkles} title="Saved AI responses" />
      <p className="text-xs text-text-muted">
        Optional local history. Enable saving in AI Configuration; payload inputs are excluded.
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-text-muted">No saved responses.</p>
      ) : (
        <>
          <Button
            onClick={async () => {
              if (
                !(await confirm({
                  title: 'Clear AI history?',
                  message: 'Permanently remove every saved AI response.'
                }))
              )
                return
              const r = await window.api.ai.clearHistory()
              if (r.success) {
                setEntries([])
                setSelected(null)
              } else
                useUIStore.getState().addNotification('error', r.error ?? 'Could not clear history')
            }}
          >
            Clear history
          </Button>
          {entries.map((e) => (
            <div key={e.id} className="rounded border border-border p-3">
              <button
                className="text-xs"
                onClick={() => setSelected(selected === e.id ? null : e.id)}
                aria-expanded={selected === e.id}
              >
                {e.feature} · {e.provider} / {e.model} · {new Date(e.at).toLocaleString()}
              </button>
              {selected === e.id && <AIMarkdown content={e.response.content} />}
            </div>
          ))}
        </>
      )}
      {dialog}
    </section>
  )
}
function UpdateSection() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const { confirm, dialog } = useConfirmation()
  useEffect(() => {
    let alive = true
    const read = () =>
      void window.api.app.updateState().then((r) => {
        if (alive && r.data) setState(r.data)
      })
    read()
    const timer = setInterval(read, 2000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
  const busy = ['checking', 'downloading'].includes(state.status)
  const message =
    state.status === 'unsupported'
      ? 'Updates are available in installed builds.'
      : state.status === 'current'
        ? `KafkaLens ${state.version} is up to date.`
        : state.status === 'available'
          ? `Version ${state.version} is available.`
          : state.status === 'ready'
            ? `Version ${state.version} is ready. Restart to install.`
            : state.status === 'downloading'
              ? `Downloading update: ${Math.round(state.percent ?? 0)}%`
              : state.status === 'error'
                ? state.error
                : state.status === 'checking'
                  ? 'Checking for updates…'
                  : 'Check for a new KafkaLens release.'
  return (
    <section className="space-y-3">
      <SectionHeader icon={Download} title="Application updates" />
      <p role="status" className="text-xs text-text-secondary">
        {message}
      </p>
      <div className="flex gap-2">
        <Button
          disabled={busy || state.status === 'ready'}
          onClick={async () => {
            const r = await window.api.app.checkUpdate()
            if (r.data) setState(r.data)
          }}
        >
          Check for updates
        </Button>
        {state.status === 'available' && (
          <Button
            onClick={async () => {
              setState((s) => ({ ...s, status: 'downloading', percent: 0 }))
              const r = await window.api.app.downloadUpdate()
              if (!r.success)
                useUIStore.getState().addNotification('error', r.error ?? 'Update download failed')
            }}
          >
            Download update
          </Button>
        )}
        {state.status === 'ready' && (
          <Button
            onClick={async () => {
              if (
                !(await confirm({
                  title: 'Restart KafkaLens?',
                  message:
                    'KafkaLens will close its connections and restart to install the downloaded update.'
                }))
              )
                return
              const r = await window.api.app.installUpdate()
              if (!r.success)
                useUIStore
                  .getState()
                  .addNotification('error', r.error ?? 'Could not install update')
            }}
          >
            Restart and install
          </Button>
        )}
      </div>
      {dialog}
    </section>
  )
}
