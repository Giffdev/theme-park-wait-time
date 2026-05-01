'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Check, Link2, Loader2 } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripName: string;
  shareId: string | null;
  onEnableSharing: () => Promise<string>; // returns shareId
  onDisableSharing: () => Promise<void>;
}

export default function ShareModal({
  isOpen,
  onClose,
  tripName,
  shareId,
  onEnableSharing,
  onDisableSharing,
}: ShareModalProps) {
  const [enabled, setEnabled] = useState(!!shareId);
  const [currentShareId, setCurrentShareId] = useState(shareId);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEnabled(!!shareId);
    setCurrentShareId(shareId);
  }, [shareId]);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const shareUrl = currentShareId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/trips/shared/${currentShareId}`
    : '';

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (enabled) {
        await onDisableSharing();
        setEnabled(false);
        setCurrentShareId(null);
      } else {
        const newShareId = await onEnableSharing();
        setEnabled(true);
        setCurrentShareId(newShareId);
      }
    } catch (err) {
      console.error('Share toggle failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select input text
      const input = document.querySelector<HTMLInputElement>('#share-url-input');
      input?.select();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-primary-900">Share Trip</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-primary-400 hover:bg-primary-100 hover:text-primary-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Trip name */}
        <p className="text-sm text-primary-500 mb-4">
          <span className="font-medium text-primary-700">{tripName}</span>
        </p>

        {/* Toggle */}
        <div className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50/50 p-4 mb-4">
          <div className="flex items-center gap-3">
            <Link2 className="h-5 w-5 text-primary-500" />
            <div>
              <p className="text-sm font-medium text-primary-800">Make Shareable</p>
              <p className="text-xs text-primary-400">Anyone with the link can view</p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={loading}
            role="switch"
            aria-checked={enabled}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
              enabled ? 'bg-indigo-600' : 'bg-gray-300'
            } ${loading ? 'opacity-60' : 'cursor-pointer'}`}
          >
            {loading ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              </span>
            ) : (
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            )}
          </button>
        </div>

        {/* Share URL */}
        {enabled && currentShareId && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <label htmlFor="share-url-input" className="sr-only">Share URL</label>
            <div className="flex items-center gap-2 rounded-lg border border-primary-200 bg-white p-2">
              <input
                id="share-url-input"
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 min-w-0 bg-transparent text-sm text-primary-700 outline-none select-all truncate"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors ${
                  copied ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Link
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Disabled state message */}
        {!enabled && (
          <p className="text-xs text-primary-400 text-center">
            Enable sharing to generate a public link for this trip.
          </p>
        )}
      </div>
    </div>
  );
}
