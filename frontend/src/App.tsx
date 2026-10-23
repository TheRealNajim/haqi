import { Component, useLayoutEffect, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { HomePage } from "@/pages/Home";

type BoundaryProps = { children: ReactNode };
type BoundaryState = { error: Error | null };

class AppErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            This page didn't load
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong on our end. You can try refreshing or head back home.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}

// Refreshing must not move the reader: the SPA shell starts empty, so the
// browser's own scroll restoration clamps to the top before React renders.
// Remember the position instead and put it back once the layout is committed.
const SCROLL_KEY = "haqi:refresh-scroll";

function useRefreshScrollRestoration() {
  useLayoutEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    const saved = Number(sessionStorage.getItem(SCROLL_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      window.scrollTo(0, saved);
    }

    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      });
    };
    window.addEventListener("scroll", save, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
    };
  }, []);
}

export default function App() {
  useRefreshScrollRestoration();

  return (
    <>
      <AppErrorBoundary>
        <HomePage />
      </AppErrorBoundary>
      <Toaster />
    </>
  );
}
