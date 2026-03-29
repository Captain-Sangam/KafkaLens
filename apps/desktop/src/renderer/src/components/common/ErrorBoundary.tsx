import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-text-muted">
          <AlertTriangle className="h-10 w-10 text-danger" />
          <h2 className="text-lg font-semibold text-text-primary">Something went wrong</h2>
          <p className="max-w-md text-center text-sm">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
