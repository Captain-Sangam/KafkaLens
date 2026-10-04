import { lazy, Suspense } from 'react'
import { Shield } from 'lucide-react'

const Markdown = lazy(() => import('react-markdown'))

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-3 mt-1 flex items-center gap-2 text-lg font-bold text-text-primary">
      <Shield className="h-5 w-5 text-accent" />
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-5 text-sm font-semibold text-text-primary border-b border-border pb-1.5">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-3 text-xs font-semibold text-text-primary">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 text-sm leading-relaxed text-text-secondary">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3 ml-1 space-y-1.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3 ml-1 space-y-1.5 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-sm text-text-secondary">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-warning">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-accent">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg bg-surface-0 p-3 font-mono text-xs text-text-secondary">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="mb-3 border-l-2 border-warning pl-3 text-sm text-warning/90">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />
}

export function AIMarkdown({ content }: { content: string }) {
  return (
    <Suspense
      fallback={<p className="text-sm text-text-secondary whitespace-pre-wrap">{content}</p>}
    >
      <div className="prose-kafkalens">
        <Markdown components={markdownComponents}>{content}</Markdown>
      </div>
    </Suspense>
  )
}
