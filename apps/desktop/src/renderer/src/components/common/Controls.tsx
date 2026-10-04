import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react'
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded border border-border bg-surface-3 px-3 py-1.5 text-xs hover:bg-surface-4 disabled:opacity-40 ${props.className ?? ''}`}
    />
  )
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded border border-border bg-surface-1 px-3 py-1.5 text-xs ${props.className ?? ''}`}
    />
  )
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded border border-border bg-surface-1 px-3 py-1.5 text-xs ${props.className ?? ''}`}
    />
  )
}
