const NOT_CONFIGURED_MSG =
  'AI is not configured. Go to Settings (⌘7) → AI Configuration to add your API key.'

export async function checkAIConfigured(): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await window.api.ai.isConfigured()
    if (res?.data) return { ok: true }
    return { ok: false, message: NOT_CONFIGURED_MSG }
  } catch {
    return { ok: false, message: NOT_CONFIGURED_MSG }
  }
}
