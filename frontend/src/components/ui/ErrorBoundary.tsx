import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LogOut, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MoA-AMS ErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetTab = () => {
    localStorage.removeItem('moa_active_tab');
    window.location.reload();
  };

  private handleFullReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'An unexpected application error occurred.';

      return (
        <div className="min-h-screen w-full bg-[#071911] text-white flex items-center justify-center p-4 selection:bg-emerald-600 selection:text-white">
          <div className="max-w-lg w-full bg-[#092218] border border-emerald-900/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 animate-fadeIn">
            {/* Brand Logo & Icon */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0F4A2B] to-[#04180E] border border-amber-400/50 flex items-center justify-center p-2 shadow-lg shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">
                  MoA<span className="text-[#FCDD09]">-AMS</span>
                </h1>
                <p className="text-xs text-emerald-200/80">
                  {this.props.fallbackTitle || 'Application Notice'}
                </p>
              </div>
            </div>

            {/* Error Message Box */}
            <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs space-y-2">
              <p className="font-semibold text-red-100">The application encountered a temporary display issue.</p>
              <p className="text-[11px] font-mono opacity-90 break-words">{errorMsg}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-[3px] shadow transition cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload page
              </button>

              <button
                type="button"
                onClick={this.handleResetTab}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs rounded-[3px] border border-white/20 transition cursor-pointer"
              >
                <Home className="w-3.5 h-3.5 text-amber-400" />
                Open default page
              </button>

              <button
                type="button"
                onClick={this.handleFullReset}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign in again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
