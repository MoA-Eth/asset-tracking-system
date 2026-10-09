import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { DOC_GUIDES, groupGuides, searchGuides } from '../docs/guides';

const STORED_GUIDE = 'moa_doc_guide';

/** How each part of a guide looks, in the same style as the rest of the app */
const MARKDOWN: Components = {
  h1: (props) => <h1 className="text-xl font-extrabold tracking-tight text-slate-900" {...props} />,
  h2: (props) => <h2 className="mt-7 border-b border-slate-200 pb-1.5 text-sm font-bold text-slate-900" {...props} />,
  h3: (props) => <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-600" {...props} />,
  p: (props) => <p className="mt-3 text-sm leading-relaxed text-slate-700" {...props} />,
  ol: (props) => <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 marker:font-semibold marker:text-emerald-700" {...props} />,
  ul: (props) => <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 marker:text-emerald-600" {...props} />,
  li: (props) => <li className="pl-1" {...props} />,
  strong: (props) => <strong className="font-semibold text-slate-900" {...props} />,
  code: (props) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-800" {...props} />,
  blockquote: (props) => (
    <blockquote className="mt-4 rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50/70 px-4 py-2.5 text-sm text-emerald-950 [&>p]:mt-0" {...props} />
  ),
  table: (props) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600" {...props} />,
  th: (props) => <th className="border-b border-slate-200 px-3 py-2" {...props} />,
  td: (props) => <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700" {...props} />,
  hr: () => <hr className="my-6 border-slate-200" />,
  a: ({ href, ...props }) => (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-950" {...props} />
  ),
};

/** The user manual: a list of guides, and the one that is open */
export const DocsPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [guideId, setGuideId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORED_GUIDE);
      if (saved && DOC_GUIDES.some((g) => g.id === saved)) return saved;
    } catch {
      // storage can be blocked; start from the first guide
    }
    return DOC_GUIDES[0].id;
  });
  const reader = useRef<HTMLDivElement>(null);

  const open = (id: string) => {
    setGuideId(id);
    try {
      localStorage.setItem(STORED_GUIDE, id);
    } catch {
      // not worth failing for
    }
  };

  const matches = useMemo(() => searchGuides(DOC_GUIDES, query), [query]);
  const groups = useMemo(() => groupGuides(matches), [matches]);

  const index = DOC_GUIDES.findIndex((g) => g.id === guideId);
  const guide = DOC_GUIDES[index] ?? DOC_GUIDES[0];
  const previous = index > 0 ? DOC_GUIDES[index - 1] : undefined;
  const next = index >= 0 && index < DOC_GUIDES.length - 1 ? DOC_GUIDES[index + 1] : undefined;

  // A new guide starts at its top
  useEffect(() => {
    reader.current?.scrollTo?.({ top: 0 });
  }, [guide.id]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-start">
      <nav aria-label="Guides" className="md:sticky md:top-4 md:w-64 md:shrink-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Search the guides"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guides…"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* On a phone: a menu instead of a long list above the guide */}
        <select
          aria-label="Choose a guide"
          value={guide.id}
          onChange={(e) => open(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 md:hidden"
        >
          {matches.map((g) => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>

        <div className="mt-3 hidden space-y-4 md:block">
          {groups.length === 0 && <p className="px-1 text-xs text-slate-500">No guide matches “{query}”.</p>}
          {groups.map((group) => (
            <div key={group.category}>
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{group.category}</p>
              <ul className="space-y-0.5">
                {group.guides.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => open(g.id)}
                      aria-current={g.id === guide.id ? 'page' : undefined}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left transition cursor-pointer ${
                        g.id === guide.id ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="block text-xs font-semibold">{g.title}</span>
                      <span className="block text-[10px] text-slate-500">{g.audience}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <article ref={reader} aria-label={guide.title} className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-xs sm:px-8 sm:py-7">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
          <BookOpen className="h-3.5 w-3.5" />
          {guide.category} · For {guide.audience.toLowerCase()}
        </p>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
          {guide.body}
        </ReactMarkdown>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs">
          {previous ? (
            <button type="button" onClick={() => open(previous.id)} className="inline-flex items-center gap-1 font-semibold text-emerald-800 hover:underline cursor-pointer">
              <ChevronLeft className="h-3.5 w-3.5" /> {previous.title}
            </button>
          ) : <span />}
          {next ? (
            <button type="button" onClick={() => open(next.id)} className="inline-flex items-center gap-1 text-right font-semibold text-emerald-800 hover:underline cursor-pointer">
              {next.title} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : <span />}
        </div>
      </article>
    </div>
  );
};

export default DocsPage;
