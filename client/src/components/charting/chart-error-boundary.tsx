/**
 * A chart that throws must take down only the chart, never the page. Without
 * this, an error inside a chart effect reaches the root ErrorBoundary and the
 * whole screen becomes "This screen hit an error" (seen as "home page doesn't
 * work" on 2026-10-07). The fallback offers an in-place remount.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recoverIfStale } from '@/lib/stale-bundle';

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null; attempt: number }

export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[chart] ${this.props.label ?? 'chart'} failed`, error, info.componentStack);
    // A lazy chart chunk missing after a deploy is a stale tab, not a chart bug:
    // keep the app-wide "new version — reload" path for it.
    void recoverIfStale(error);
  }

  private reload = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          data-testid="chart-error"
          style={{ display: 'grid', placeItems: 'center', gap: 8, height: '100%', minHeight: 120, padding: 16, color: 'var(--text-mute, #7f889a)', fontSize: 12, textAlign: 'center' }}
        >
          <div>Chart failed to draw.</div>
          <button
            type="button"
            onClick={this.reload}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 }}
          >
            Reload chart
          </button>
        </div>
      );
    }
    // A new key on retry remounts the chart from scratch (fresh instance).
    return <ChartAttempt key={this.state.attempt}>{this.props.children}</ChartAttempt>;
  }
}

function ChartAttempt({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
