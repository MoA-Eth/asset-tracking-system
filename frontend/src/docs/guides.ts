/**
 * The user manual: one short guide per part of the system, written in Markdown (the .md files beside this one)
 * and built into the app, so it works offline and always matches the version that is running.
 * The order here is the order in the list; the category groups the list the way the menu is grouped.
 */
export interface DocGuide {
  id: string;
  title: string;
  category: string;
  /** Who it is for, shown under the title in the list */
  audience: string;
  /** The Markdown text */
  body: string;
}

// Every guide file in this folder, as text. The file name is the key.
const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const text = (file: string): string => files[`./${file}`] ?? `# ${file}\n\nThis guide is not available.`;

export const DOC_GUIDES: ReadonlyArray<DocGuide> = [
  { id: 'getting-started', title: 'Getting started', category: 'Overview', audience: 'Everyone', body: text('getting-started.md') },
  { id: 'assets', title: 'The Assets register', category: 'Daily work', audience: 'Store staff and approvers', body: text('assets.md') },
  { id: 'receiving', title: 'Receiving items (Model 19)', category: 'Daily work', audience: 'Data Encoder', body: text('receiving.md') },
  { id: 'issuing', title: 'Issuing items (Model 22)', category: 'Daily work', audience: 'Data Encoder', body: text('issuing.md') },
  { id: 'transfers-returns', title: 'Transfers and returns (Model 21)', category: 'Daily work', audience: 'Data Encoder', body: text('transfers-returns.md') },
  { id: 'disposal', title: 'Disposing of assets', category: 'Daily work', audience: 'Data Encoder', body: text('disposal.md') },
  { id: 'approvals', title: 'Approvals', category: 'Review', audience: 'Team Leader and Department Head', body: text('approvals.md') },
  { id: 'reports', title: 'Dashboard, reports and audit log', category: 'Review', audience: 'Managers, approvers and administrators', body: text('reports.md') },
  { id: 'my-assets', title: 'My assets', category: 'Employees', audience: 'Employees', body: text('my-assets.md') },
  { id: 'administration', title: 'Users, employees, stores and settings', category: 'Administration', audience: 'System Administrator', body: text('administration.md') },
  { id: 'troubleshooting', title: 'Questions and problems', category: 'Help', audience: 'Everyone', body: text('troubleshooting.md') },
];

/** Case-insensitive search over the titles and the text of the guides */
export function searchGuides(guides: ReadonlyArray<DocGuide>, query: string): DocGuide[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...guides];
  return guides.filter((g) => g.title.toLowerCase().includes(q) || g.body.toLowerCase().includes(q));
}

/** The guides grouped by category, in the order the categories first appear */
export function groupGuides(guides: ReadonlyArray<DocGuide>): { category: string; guides: DocGuide[] }[] {
  const groups: { category: string; guides: DocGuide[] }[] = [];
  for (const guide of guides) {
    const group = groups.find((g) => g.category === guide.category);
    if (group) group.guides.push(guide);
    else groups.push({ category: guide.category, guides: [guide] });
  }
  return groups;
}
