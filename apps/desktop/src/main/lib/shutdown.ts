// Stop Kafka normally, but do not let pending broker reads prevent app exit.
export function beginShutdown(
  disconnect: () => Promise<void>,
  close: () => void,
  quit: () => void,
  timeoutMs = 5000
): void {
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    try {
      close()
    } finally {
      quit()
    }
  }
  const timer = setTimeout(finish, timeoutMs)
  void Promise.resolve()
    .then(disconnect)
    .catch(() => {})
    .finally(finish)
}
