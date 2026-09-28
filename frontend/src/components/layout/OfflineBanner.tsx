import React from 'react';
import { WifiOff, DownloadCloud } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

export const OfflineBanner: React.FC = () => {
  const { isOnline, isInstallable, installPWA } = usePWA();

  return (
    <>
      {!isOnline && (
        <div className="bg-amber-600/90 text-amber-50 px-4 py-2 text-xs md:text-sm font-medium flex items-center justify-center gap-2 shadow-inner">
          <WifiOff className="w-4 h-4 animate-pulse" />
          <span>You are currently <strong>Offline</strong>. MoA-AMS PWA is serving cached asset records.</span>
        </div>
      )}

      {isInstallable && (
        <div className="bg-emerald-800/90 text-emerald-100 px-4 py-2 text-xs md:text-sm flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <DownloadCloud className="w-4 h-4 text-emerald-300" />
            <span>Install MoA-AMS on your mobile or desktop for full offline field access</span>
          </div>
          <button
            onClick={installPWA}
            className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold rounded text-xs transition"
          >
            Install
          </button>
        </div>
      )}
    </>
  );
};
