import type { ReactNode } from 'react';
import { Component } from 'react';

export type IoDevtoolsErrorBoundaryProps = {
  fallback?: (args: { error: unknown; reset: () => void }) => ReactNode;
  children: ReactNode;
};

type State = { error: unknown | null };

export class IoDevtoolsErrorBoundary extends Component<
  IoDevtoolsErrorBoundaryProps,
  State
> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      return this.props.fallback ? (
        this.props.fallback({ error: this.state.error, reset: this.reset })
      ) : (
        <div
          style={{
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: 12,
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: 8,
            padding: 12,
            background: 'rgba(15,23,42,0.04)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>DevTools crashed</div>
          <div style={{ opacity: 0.9, marginBottom: 8 }}>
            {this.state.error instanceof Error
              ? this.state.error.message
              : String(this.state.error)}
          </div>
          <button onClick={this.reset}>Restart DevTools UI</button>
        </div>
      );
    }
    return this.props.children;
  }
}
