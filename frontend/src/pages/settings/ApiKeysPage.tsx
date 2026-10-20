import React, { useEffect, useState } from 'react';
import { AlertCircle, Ban, Check, Copy, KeyRound, Plus, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import { btn, table } from '../../components/ui/theme';
import { Modal } from '../../components/ui/Modal';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { Field, FieldGrid, FormError, FormFooter, inputClass } from '../../components/ui/FormKit';
import { useToast } from '../../context/ToastContext';
import { ApiKey } from '../../types/asset-management';
import { ConfirmDialog } from './reference-ui';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : 'Never');

const StatusPill: React.FC<{ status: ApiKey['status'] }> = ({ status }) => {
  const look = {
    ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    REVOKED: 'bg-rose-50 text-rose-800 border-rose-200',
    EXPIRED: 'bg-slate-100 text-slate-700 border-slate-200',
  }[status];
  return <span className={`inline-flex rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold ${look}`}>{status === 'ACTIVE' ? 'Active' : status === 'REVOKED' ? 'Revoked' : 'Expired'}</span>;
};

// ─── New key: name it, then copy it once ────────────────────────────────────

const NewKeyForm: React.FC<{ onCancel: () => void; onCreated: (key: string, apiKey: ApiKey) => void }> = ({ onCancel, onCreated }) => {
  const [name, setName] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // The key works until the end of the chosen day
      const { key, apiKey } = await api.createApiKey({ name, expiresAt: expiresOn ? `${expiresOn}T23:59:59` : undefined });
      onCreated(key, apiKey);
    } catch (err: any) {
      setError(err.message || 'The key could not be created.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGrid cols={2}>
        <Field label="Service" required span="sm:col-span-2" htmlFor="key-name" hint="Who will hold this key, so you know which service is calling.">
          <input id="key-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass('emerald')} placeholder="e.g. Ministry KPI dashboard" autoFocus />
        </Field>
        <Field label="Expires on" optional htmlFor="key-expiry" hint="Leave empty for a key that works until revoked.">
          <input id="key-expiry" type="date" value={expiresOn} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiresOn(e.target.value)} className={inputClass('emerald')} />
        </Field>
        <Field label="Can read" htmlFor="key-scope">
          <p id="key-scope" className="py-1.5 text-[13px] text-slate-700">The key figures only (<span className="font-mono">GET /api/kpis</span>)</p>
        </Field>
      </FieldGrid>
      <FormError message={error} />
      <FormFooter accent="emerald" submitting={submitting} submitLabel="Create key" onCancel={onCancel} sticky={false} />
    </form>
  );
};

/** The new key, shown this once: copied and handed to the service's developer */
const ShowKeyOnce: React.FC<{ apiKey: ApiKey; secret: string; onDone: () => void }> = ({ apiKey, secret, onDone }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. not https): the person selects the key by hand
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        <p>
          Copy this key now and send it securely to the developer of <strong>{apiKey.name}</strong>. It is shown only this once;
          if it is lost, revoke it and create a new one. It belongs on their server, never in a web page.
        </p>
      </div>
      <div className="flex items-stretch gap-2">
        <input readOnly value={secret} aria-label="New API key" onFocus={(e) => e.currentTarget.select()} className={`${inputClass('emerald', { mono: true })} flex-1`} />
        <button type="button" onClick={copy} className={btn.secondary}>
          {copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[11px] text-slate-600">
        Their server sends it with each call: <span className="font-mono">GET /api/kpis</span> with the header <span className="font-mono">X-API-Key</span>. The API documentation (<span className="font-mono">/api/docs</span>) describes the figures.
      </p>
      <div className="flex justify-end">
        <button type="button" onClick={onDone} className={btn.primary}>Done</button>
      </div>
    </div>
  );
};

// ─── The list ───────────────────────────────────────────────────────────────

/**
 * Keys other systems' servers use to read this app's key figures (e.g. the Ministry KPI dashboard). One key per
 * service: each can be revoked on its own, and shows when it was last used.
 */
export const ApiKeysPage: React.FC = () => {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ secret: string; apiKey: ApiKey } | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await api.getApiKeys());
    } catch (err: any) {
      setError(err.message || 'The API keys could not be loaded.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await api.revokeApiKey(revoking.id);
      toast.success('API key revoked', `${revoking.name} can no longer read the key figures.`);
      setRevoking(null);
      await load();
    } catch (err: any) {
      toast.error(`Could not revoke ${revoking.name}`, err.message);
    } finally {
      setBusy(false);
    }
  };

  const active = keys.filter((k) => k.status === 'ACTIVE').length;

  return (
    <div className="space-y-3 animate-fadeIn pb-16">
      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : (
        <div className="rounded-md overflow-hidden bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
          <div className="flex flex-col gap-2.5 border-b border-slate-200 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-600 max-w-2xl">
              Keys let another system's server read this app's key figures (totals, pending requests, stock movement) — numbers only, no
              items or names. Give each service its own key.
            </p>
            <button type="button" onClick={() => setCreating(true)} className={`${btn.primary} shrink-0`}>
              <Plus className="h-4 w-4" />
              <span>New key</span>
            </button>
          </div>
          <div className="flex items-center justify-between px-3.5 py-1.5 text-xs text-slate-500">
            <span><span className="font-semibold text-slate-900">{keys.length}</span> {keys.length === 1 ? 'key' : 'keys'}</span>
            <span>{active} active</span>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-slate-500">Loading…</div>
          ) : keys.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <KeyRound className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              No API keys yet. Create one for each service that needs the key figures.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]" aria-label="API keys">
                <thead>
                  <tr className={table.headRow}>
                    <th className="px-4 py-1.5">Service</th>
                    <th className="px-4 py-1.5">Status</th>
                    <th className="px-4 py-1.5">Last used</th>
                    <th className="px-4 py-1.5">Expires</th>
                    <th className="px-4 py-1.5">Created</th>
                    <th className="px-4 py-1.5 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {keys.map((k) => (
                    <tr key={k.id} className={table.row}>
                      <td className="px-4 py-2.5">
                        <span className="block font-medium text-slate-900">{k.name}</span>
                        <span className="block font-mono text-[11px] text-slate-500">{k.hint}</span>
                      </td>
                      <td className="px-4 py-2.5"><StatusPill status={k.status} /></td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{k.lastUsedAt ? when(k.lastUsedAt) : 'Not yet'}</td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{day(k.expiresAt)}</td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <span className="block whitespace-nowrap">{when(k.createdAt)}</span>
                        <span className="block text-[11px] text-slate-500">by {k.createdByName}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <RowActionsMenu
                          label={k.name}
                          actions={[{ label: 'Revoke', icon: Ban, onClick: () => setRevoking(k), hidden: k.status !== 'ACTIVE' }]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={creating || !!created}
        onClose={() => {
          setCreating(false);
          setCreated(null);
        }}
        title={created ? `Key for ${created.apiKey.name}` : 'New API key'}
        subtitle={created ? 'Shown only this once.' : 'For one service that reads the key figures.'}
        size="md"
      >
        {created ? (
          <ShowKeyOnce
            apiKey={created.apiKey}
            secret={created.secret}
            onDone={() => {
              setCreated(null);
              load();
            }}
          />
        ) : (
          creating && (
            <NewKeyForm
              onCancel={() => setCreating(false)}
              onCreated={(secret, apiKey) => {
                setCreating(false);
                setCreated({ secret, apiKey });
                load();
              }}
            />
          )
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!revoking}
        title={revoking ? `Revoke the key of ${revoking.name}?` : ''}
        confirmLabel="Revoke"
        danger
        busy={busy}
        onConfirm={revoke}
        onClose={() => setRevoking(null)}
      >
        It stops working at once: {revoking?.name} will no longer be able to read the key figures. This can't be undone; to give
        access again, create a new key.
      </ConfirmDialog>
    </div>
  );
};
