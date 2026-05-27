import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0f170a]">
          <h1 className="text-red-500 text-2xl font-black uppercase italic tracking-tighter mb-4">
            Something went wrong
          </h1>
          <p className="text-gray-400 text-sm mb-8 max-w-xs leading-relaxed font-medium">An unexpected error occurred. Please try reloading the application.</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-white text-black rounded-xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-transform">
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;