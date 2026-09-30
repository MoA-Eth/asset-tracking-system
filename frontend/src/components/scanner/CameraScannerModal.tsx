import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Barcode, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { ItemWithRelations } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { useToast } from '../../context/ToastContext';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem?: (item: ItemWithRelations) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onSelectItem,
}) => {
  const toast = useToast();
  const [manualCode, setManualCode] = useState('');
  const [isScanningCamera, setIsScanningCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedItem, setScannedItem] = useState<ItemWithRelations | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus input for hardware USB wedge scanners
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      stopCamera();
      setScannedItem(null);
      setSearchError(null);
      setManualCode('');
    }
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    setIsScanningCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      const msg = 'Camera access unavailable or denied. Use barcode reader or manual entry.';
      setCameraError(msg);
      toast.warning('Camera Scanner', msg);
      setIsScanningCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanningCamera(false);
  };

  const handleLookup = async (codeToSearch: string) => {
    const code = codeToSearch.trim();
    if (!code) return;

    setLoading(true);
    setSearchError(null);
    try {
      const item = await api.getItemById(code);
      setScannedItem(item);
      toast.success(
        'Asset Located',
        `${item.itemCode} — ${item.name} (${item.status.replace(/_/g, ' ')})`
      );
      if (onSelectItem) {
        onSelectItem(item);
      }
    } catch {
      const msg = `Item with Code, Serial, or IFMIS Slip "${code}" not found.`;
      setSearchError(msg);
      toast.error('Asset Not Found', msg);
      setScannedItem(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLookup(manualCode);
    }
  };

  if (!isOpen) return null;

  const sampleCodes = [
    'MOA-VEH-2024-0001',
    'MOA-AGR-2024-0002',
    'MOA-IT-2024-0003',
    'IFMIS-GRN-2024-0419',
    'IFMIS-GRN-2024-0580',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-emerald-800 border-b border-emerald-900 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-white/10 text-white">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Barcode & IFMIS Slip Scanner</h3>
              <p className="text-[11px] text-emerald-100">Mobile Camera & USB Wedge Compatible</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-700/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4">
          {isScanningCamera ? (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video border-2 border-emerald-500/50 flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-3/4 h-24 border-2 border-dashed border-emerald-400 rounded-lg relative">
                  <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-bounce" />
                </div>
                <span className="text-[10px] text-emerald-300 font-mono mt-2 bg-black/60 px-2 py-0.5 rounded">
                  Point camera at asset barcode or IFMIS slip
                </span>
              </div>
              <button
                onClick={stopCamera}
                className="absolute top-2 right-2 px-2.5 py-1 bg-black/70 hover:bg-black/90 text-white rounded text-xs"
              >
                Close Camera
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2">
              <Camera className="w-8 h-8 text-emerald-700 mx-auto" />
              <div>
                <p className="text-xs font-semibold text-slate-800">Mobile Camera Scanner</p>
                <p className="text-[11px] text-slate-500">Scan physical asset tags or IFMIS documents</p>
              </div>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs transition active:scale-95"
              >
                Launch Device Camera
              </button>
              {cameraError && (
                <p className="text-[11px] text-amber-700 mt-1">{cameraError}</p>
              )}
            </div>
          )}

          {/* Wedge / Manual Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Scan or Enter Item Code / IFMIS Slip:</span>
              <span className="text-[10px] text-emerald-700 font-mono font-bold">Auto-submits on Enter</span>
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g. MOA-VEH-2024-0001 or IFMIS-GRN-2024-0419"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white font-mono"
              />
              <button
                onClick={() => handleLookup(manualCode)}
                disabled={loading || !manualCode.trim()}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shrink-0"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </div>
          </div>

          {/* Sample quick tags */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Quick Test Tags / Slips:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sampleCodes.map((code) => (
                <button
                  key={code}
                  onClick={() => {
                    setManualCode(code);
                    handleLookup(code);
                  }}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-emerald-800 border border-slate-200 rounded text-[11px] font-mono transition"
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          {/* Result Card */}
          {scannedItem && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Item Found
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {scannedItem.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">{scannedItem.name}</h4>
                <p className="text-xs font-mono text-emerald-800 font-semibold mt-0.5">{scannedItem.itemCode}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-emerald-200">
                <div>
                  <span className="text-slate-500">Valuation:</span>
                  <span className="text-slate-900 ml-1 font-semibold">{formatETB(scannedItem.unitCostETB)}</span>
                </div>
                <div>
                  <span className="text-slate-500">IFMIS Slip:</span>
                  <span className="font-mono text-amber-800 ml-1 font-semibold">{scannedItem.ifmisSlipNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500">Custodian:</span>
                  <span className="text-slate-900 ml-1 truncate">
                    {scannedItem.currentCustodian?.fullNameEn || scannedItem.storeLocation?.siteName || 'Head office'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Department:</span>
                  <span className="text-slate-900 ml-1 truncate">
                    {scannedItem.assignedDepartment?.code || 'Store Pool'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {searchError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{searchError}</span>
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
