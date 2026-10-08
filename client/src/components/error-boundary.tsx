import { Component, ErrorInfo, ReactNode } from 'react';
import { recoverIfStale } from '@/lib/stale-bundle';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isChunkError: boolean;
}

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("dynamically imported module") ||
    msg.includes("failed to load module script")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('=== ERROR BOUNDARY CAUGHT ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('============================');

    this.setState({ error, errorInfo });

    // Stale bundle after a deploy (missing chunk, or old+new code mixed into a
    // ReferenceError): the shared guard shows "New version available" and
    // reloads once, loop-guarded. Confirmed stale → swap the crash screen for
    // the quiet updating screen.
    void recoverIfStale(error).then((stale) => {
      if (stale && !this.state.isChunkError) this.setState({ isChunkError: true });
    });
  }

  render() {
    if (this.state.hasError) {
      // Friendly UI for chunk load errors (stale deployment)
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen bg-card text-foreground flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <div className="mb-6">
                <svg className="h-16 w-16 mx-auto text-sky-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-foreground mb-2">Updating QuantEdge…</h1>
              <p className="text-muted-foreground mb-6 text-sm">
                A new version is out. Reloading to get it.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 rounded-lg font-medium transition-colors"
              >
                Reload now
              </button>
            </div>
          </div>
        );
      }

      // Generic error UI for non-chunk errors. Plain words first; the message,
      // stack and component trace sit behind "Details" (audit 2026-10-07 #9).
      return (
        <div className="min-h-screen bg-card text-foreground p-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-3">This screen didn’t load</h1>
            <p className="text-sm text-muted-foreground mb-5">Something on this page broke. Reloading usually fixes it, and your data is safe. If it keeps happening, open Details and send it to support.</p>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-white"
            >
              Reload page
            </button>
            <details className="mt-6 bg-muted rounded-lg p-4">
              <summary className="cursor-pointer text-sm text-muted-foreground min-h-[44px] flex items-center">Details</summary>
              <pre className="mt-2 text-xs text-foreground/80 whitespace-pre-wrap break-all">{this.state.error?.message}</pre>
              <pre className="mt-2 text-xs text-foreground/70 whitespace-pre-wrap break-all overflow-auto max-h-64">{this.state.error?.stack}</pre>
              <pre className="mt-2 text-xs text-foreground/70 whitespace-pre-wrap break-all overflow-auto max-h-64">{this.state.errorInfo?.componentStack}</pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
