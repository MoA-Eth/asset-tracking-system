import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { PROGRAMS as FALLBACK_PROGRAMS } from './receipt-options';
import { Modal } from '../ui/Modal';
import { Field, FieldGrid, FormError, FormFooter, inputClass } from '../ui/FormKit';
import { useToast } from '../../context/ToastContext';

const ADD_NEW = '__ADD_NEW__';

/** Names compared without case or '&', so one saved as "(REDFS)" is still "(RED&FS)" on the list */
const same = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/&/g, '') === b.trim().toLowerCase().replace(/&/g, '');

/**
 * Program / project: chosen from the registered database programs (Settings → Programs).
 * Missing programs can be added directly via a quick-add modal that registers them in the database.
 */
export const ProgramSelect: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
}> = ({ id, value, onChange, className }) => {
  const toast = useToast();
  const [programs, setPrograms] = useState<string[]>(FALLBACK_PROGRAMS);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (typeof api?.getPrograms === 'function') {
      api.getPrograms()
        .then((items) => {
          if (active && Array.isArray(items) && items.length > 0) {
            const names = items.map((p) => p.name).filter(Boolean);
            if (names.length > 0) setPrograms(names);
          }
        })
        .catch(() => {
          // Gracefully keep fallback programs
        });
    }
    return () => {
      active = false;
    };
  }, []);

  const known = programs.some((p) => same(p, value));

  const openAddModal = (presetName = '') => {
    setName(presetName);
    setCode('');
    setDescription('');
    setError(null);
    setModalOpen(true);
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Program or project name is required.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.createProgram({
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
      });
      setPrograms((prev) =>
        prev.some((p) => same(p, created.name)) ? prev : [...prev, created.name].sort((a, b) => a.localeCompare(b))
      );
      onChange(created.name);
      toast.success('Program added', `${created.name} is now registered in the directory.`);
      setModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Could not save the program.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 w-full">
        <select
          id={id}
          value={known ? programs.find((p) => same(p, value)) : value}
          onChange={(e) => {
            if (e.target.value === ADD_NEW) {
              openAddModal();
            } else {
              onChange(e.target.value);
            }
          }}
          className={`${className} cursor-pointer flex-1 min-w-0`}
        >
          <option value="">None</option>
          {value.trim() && !known && (
            <option value={value}>
              {value} (unregistered)
            </option>
          )}
          {programs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add new program / project…</option>
        </select>
        <button
          type="button"
          onClick={() => openAddModal()}
          title="Add new program or project to the directory"
          aria-label="Add new program"
          className="shrink-0 p-2 rounded-[4px] border border-slate-300 hover:border-emerald-700 hover:bg-emerald-50 text-slate-600 hover:text-emerald-800 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add program / project"
        subtitle="Register a new ministry program or donor project in the directory."
        size="md"
      >
        <form onSubmit={handleCreateProgram} className="space-y-4">
          <FieldGrid cols={2}>
            <Field
              label="Program / project name"
              required
              span="sm:col-span-2"
              htmlFor="quick-program-name"
              hint="Official name, e.g. Food System Resilience Program (FSRP)."
            >
              <input
                id="quick-program-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass('emerald')}
                placeholder="e.g. Food System Resilience Program (FSRP)"
                autoFocus
              />
            </Field>
            <Field
              label="Code / abbreviation"
              optional
              htmlFor="quick-program-code"
              hint="Short acronym, e.g. FSRP."
            >
              <input
                id="quick-program-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass('emerald')}
                placeholder="e.g. FSRP"
              />
            </Field>
            <Field
              label="Description / donor"
              optional
              span="sm:col-span-2"
              htmlFor="quick-program-desc"
              hint="Scope, funding partner, or notes."
            >
              <textarea
                id="quick-program-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass('emerald')}
                placeholder="e.g. World Bank supported project"
              />
            </Field>
          </FieldGrid>
          <FormError message={error} />
          <FormFooter
            accent="emerald"
            submitting={submitting}
            submitLabel="Add and select program"
            onCancel={() => setModalOpen(false)}
            sticky={false}
          />
        </form>
      </Modal>
    </>
  );
};
