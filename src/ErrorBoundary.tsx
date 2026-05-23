import React, { Component, ErrorInfo, ReactNode } from 'react';
 // Defining props for the ErrorBoundary component
interface Props {
  children?: ReactNode;
  fallback?: ReactNode; // Optional fallback UI prop
}

interface State {
  hasError: boolean;
} // Defining state for the ErrorBoundary component

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI. This static method is called after an error has been thrown by a descendant component.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo); // Log the error to the console
    // You can also log the error to an error reporting service here, e.g., Sentry.captureException(error, { extra: errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
      <h1 className="text-red-500 text-center p-5 text-xl font-bold">Something went wrong.</h1>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;