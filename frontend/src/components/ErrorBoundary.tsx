import { Component, ErrorInfo, ReactNode } from "react";
import { reportLovableError } from "../lib/lovable-error-reporting";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    reportLovableError(error, { boundary: "react_error_boundary", info: errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--ink)] px-4 font-sans text-[var(--bg)]">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--bg)]">
              This page didn't load
            </h1>
            <p className="mt-2 text-sm text-[#A3A3A3]">
              Something went wrong on our end. You can try refreshing or head back home.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-md bg-[var(--bg)] text-black px-4 py-2 text-sm font-medium transition-colors hover:opacity-90"
              >
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-md border border-[#2D2D2D] bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-[var(--bg)] transition-colors hover:bg-[var(--bg)] hover:text-black"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
