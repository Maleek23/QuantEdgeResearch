import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('=== ERROR BOUNDARY CAUGHT ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('============================');

    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h1>
            <div className="bg-slate-800 rounded-lg p-4 mb-4">
              <h2 className="text-lg font-semibold text-red-400 mb-2">Error Message:</h2>
              <pre className="text-sm text-red-300 whitespace-pre-wrap break-all">
                {this.state.error?.message}
              </pre>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 mb-4">
              <h2 className="text-lg font-semibold text-yellow-400 mb-2">Stack Trace:</h2>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all overflow-auto max-h-64">
                {this.state.error?.stack}
              </pre>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-cyan-400 mb-2">Component Stack:</h2>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all overflow-auto max-h-64">
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
