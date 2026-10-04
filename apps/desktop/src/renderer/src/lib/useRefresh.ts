import { useEffect, useRef } from 'react'
export function useRefresh(refresh: () => unknown) {
  const callback = useRef(refresh)
  callback.current = refresh
  useEffect(() => {
    const handler = () => void callback.current()
    window.addEventListener('kafkalens:refresh', handler)
    return () => window.removeEventListener('kafkalens:refresh', handler)
  }, [])
}
