import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocsPage } from './DocsPage';
import { DOC_GUIDES, groupGuides, searchGuides } from '../docs/guides';

beforeEach(() => {
  localStorage.clear();
});

describe('The user manual guides', () => {
  it('has a written guide for every entry, each starting with its own title', () => {
    for (const guide of DOC_GUIDES) {
      expect(guide.body, guide.id).not.toMatch(/This guide is not available/);
      expect(guide.body.length, guide.id).toBeGreaterThan(400);
      expect(guide.body.split('\n')[0], guide.id).toMatch(/^# \S/);
    }
  });

  it('gives every guide a unique id and says who it is for', () => {
    expect(new Set(DOC_GUIDES.map((g) => g.id)).size).toBe(DOC_GUIDES.length);
    for (const guide of DOC_GUIDES) expect(guide.audience.length).toBeGreaterThan(2);
  });

  it('groups the list by category in the order of the manual', () => {
    expect(groupGuides(DOC_GUIDES).map((g) => g.category)).toEqual(['Overview', 'Daily work', 'Review', 'Employees', 'Administration', 'Help']);
  });

  it('searches the titles and the text', () => {
    expect(searchGuides(DOC_GUIDES, 'disposal').map((g) => g.id)).toContain('disposal');
    // A word that only appears inside a guide
    expect(searchGuides(DOC_GUIDES, 'Batch Endorse').map((g) => g.id)).toContain('approvals');
    expect(searchGuides(DOC_GUIDES, 'zzzz-nothing-matches')).toEqual([]);
    expect(searchGuides(DOC_GUIDES, '  ')).toHaveLength(DOC_GUIDES.length);
  });
});

describe('Documentation page', () => {
  it('opens the first guide, with the list beside it', () => {
    render(<DocsPage />);
    expect(screen.getByRole('article', { name: 'Getting started' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Getting started' })).toBeInTheDocument();
    const list = screen.getByRole('navigation', { name: 'Guides' });
    expect(within(list).getByRole('button', { name: /Issuing items \(Model 22\)/ })).toBeInTheDocument();
    expect(within(list).getByText('Daily work')).toBeInTheDocument();
  });

  it('opens a guide when it is chosen, and remembers it', async () => {
    const user = userEvent.setup();
    const first = render(<DocsPage />);
    await user.click(within(screen.getByRole('navigation', { name: 'Guides' })).getByRole('button', { name: /Disposing of assets/ }));
    expect(screen.getByRole('article', { name: 'Disposing of assets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Disposing of assets' })).toBeInTheDocument();

    // Coming back to the manual later starts where the reader was
    first.unmount();
    render(<DocsPage />);
    expect(screen.getByRole('article', { name: 'Disposing of assets' })).toBeInTheDocument();
  });

  it('shows the steps and tables of a guide as lists and tables', async () => {
    const user = userEvent.setup();
    render(<DocsPage />);
    await user.click(within(screen.getByRole('navigation', { name: 'Guides' })).getByRole('button', { name: /^Approvals/ }));
    const article = screen.getByRole('article', { name: 'Approvals' });
    expect(within(article).getAllByRole('listitem').length).toBeGreaterThan(4);
    expect(within(article).getByRole('table')).toBeInTheDocument();
    expect(within(article).getByRole('columnheader', { name: 'Approved' })).toBeInTheDocument();
  });

  it('steps to the next and the previous guide from the bottom', async () => {
    const user = userEvent.setup();
    render(<DocsPage />);
    const article = screen.getByRole('article', { name: 'Getting started' });
    await user.click(within(article).getByRole('button', { name: /The Assets register/ }));
    const second = screen.getByRole('article', { name: 'The Assets register' });
    await user.click(within(second).getByRole('button', { name: /Getting started/ }));
    expect(screen.getByRole('article', { name: 'Getting started' })).toBeInTheDocument();
  });

  it('narrows the list as you search, and says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<DocsPage />);
    const list = screen.getByRole('navigation', { name: 'Guides' });
    await user.type(screen.getByRole('searchbox', { name: 'Search the guides' }), 'Model 21');
    expect(within(list).getByRole('button', { name: /Transfers and returns/ })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /My assets/ })).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search the guides' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search the guides' }), 'zzzz-nothing-matches');
    expect(screen.getByText(/No guide matches/)).toBeInTheDocument();
  });
});
