import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSync } from '../utils/realtime-sync';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { approvalRows, needsChiefDirector, voucherName } from '../components/assets/slip-groups';
import { daysInStore, requestLabel, shortDate, STALE_IN_STORE_DAYS } from '../components/assets/asset-state';
import { roleName } from '../utils/roles';
import { ApprovalStatus, AuditLogEntry, Employee, ItemStatus, ItemWithRelations, TransactionApproval, UserRole } from '../types/asset-management';

/**
 * A short dashboard for the people who do the work, by what they act on: the Team Leader's endorsement queue,
 * the Department Head's approval queue and directorate, the Data Encoder's requests and store. Managers and the
 * Chief Director have the executive dashboard instead. Everything here is counted the way the Approvals and Assets
 * pages count it: a voucher of several lines is one request, an item is one line received.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

type View = 'team-leader' | 'department-head' | 'encoder' | 'admin';

/** Which view a person gets, by what they may do (a saved role setting can change a role's permissions) */
export function homeView(role: UserRole | undefined, permissions: string[] | undefined): View | undefined {
  const can = (p: string) => permissions?.includes(p) ?? false;
  if (can('approvals.authorize') || role === UserRole.DEPARTMENT_HEAD) return 'department-head';
  if (can('approvals.endorse') || role === UserRole.TEAM_LEADER) return 'team-leader';
  if (['stock-in.write', 'stock-out.write', 'transfers.write', 'disposals.write'].some(can) || role === UserRole.DATA_ENCODER) return 'encoder';
  if (can('roles.assign') || role === UserRole.SYSTEM_ADMIN) return 'admin';
  return undefined;
}

const dayOf = (a: { createdAt?: string; createdAtGc?: string }) => String(a.createdAt || a.createdAtGc || '').slice(0, 10);
const daysSince = (date: string | undefined, today: number) => {
  const ms = date ? Date.parse(date.slice(0, 10)) : NaN;
  return Number.isFinite(ms) ? Math.max(0, Math.floor((today - ms) / DAY_MS)) : undefined;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const Card: React.FC<{ label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'neutral' | 'warning'; onClick?: () => void; action?: string }> = ({
  label, value, note, tone = 'neutral', onClick, action,
}) => (
  <div className={`flex flex-col rounded-md border bg-white p-4 shadow-[0_3px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] ${tone === 'warning' ? 'border-amber-200' : 'border-slate-200/90'}`}>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`mt-2 text-2xl font-bold tabular-nums ${tone === 'warning' ? 'text-amber-800' : 'text-slate-900'}`}>{value}</p>
    {note && <p className="mt-1 text-[11px] text-slate-500">{note}</p>}
    {onClick && action && (
      <button type="button" onClick={onClick} className="mt-auto inline-flex items-center gap-1 self-start pt-3 text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer">
        {action} <ArrowRight className="h-3 w-3" />
      </button>
    )}
  </div>
);

const ListPanel: React.FC<{ title: string; action?: { label: string; onClick: () => void }; empty: string; children?: React.ReactNode; count: number }> = ({
  title, action, empty, children, count,
}) => (
  <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)]">
    <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {action && (
        <button type="button" onClick={action.onClick} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer">
          {action.label} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
    {count === 0 ? <p className="py-4 text-center text-xs text-slate-400">{empty}</p> : <ul className="divide-y divide-slate-100">{children}</ul>}
  </section>
);

/** One request (a voucher of several lines as one): what, which voucher, and how long it has waited */
const RequestRow: React.FC<{ lead: TransactionApproval; members: TransactionApproval[]; today: number; note?: string }> = ({ lead, members, today, note }) => {
  const days = daysSince(dayOf(lead), today) ?? 0;
  const what = members.length > 1 ? `${members.length} items` : lead.itemName;
  const kind = requestLabel(lead.transactionType, lead.requestDetails).noun;
  return (
    <li className="flex items-center gap-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{what}</p>
        <p className="truncate text-[11px] text-slate-500">
          <span className="capitalize">{kind}</span> · {voucherName(lead.transactionType)} {lead.ifmisSlipNumber}
          {note ? ` · ${note}` : ''}
        </p>
      </div>
      <span className={`shrink-0 tabular-nums text-[11px] ${days > 3 ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>
        {days === 0 ? 'today' : `${plural(days, 'day')}`}
      </span>
    </li>
  );
};

export const HomePage: React.FC<{ onNavigate: (tab: string) => void; currentRole: UserRole }> = ({ onNavigate, currentRole }) => {
  const { user } = useAuth();
  const view = homeView(currentRole, user?.permissions);
  const [approvals, setApprovals] = useState<TransactionApproval[]>([]);
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [people, setPeople] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      if (view === 'admin') {
        // Accounts: every employee (the deactivated too), and the audit log for changes to access
        const [e, l] = await Promise.all([api.getEmployees(undefined, { includeInactive: true }), api.getAuditLogs()]);
        setPeople(Array.isArray(e) ? e : []);
        setLogs(Array.isArray(l) ? l : []);
        setError(false);
        return;
      }
      // The approval queues need only the requests; the directorate and the store need the register too
      const [a, i] = await Promise.all([api.getApprovals(), view === 'team-leader' ? Promise.resolve([]) : api.getItems()]);
      setApprovals(Array.isArray(a) ? a : []);
      setItems(Array.isArray(i) ? i : []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [view]);
  useEffect(() => { load(); }, [load]);
  useRealtimeSync(load);

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = (date?: string) => (daysSince(date, today) ?? Infinity) < WEEK_DAYS;
  const me = user?.id;

  const figures = useMemo(() => {
    const pending = approvals.filter((a) => a.status === ApprovalStatus.PENDING);
    const oldestFirst = <T extends { lead: TransactionApproval }>(rows: T[]) => [...rows].sort((x, y) => dayOf(x.lead).localeCompare(dayOf(y.lead)));
    const atStage1 = oldestFirst(approvalRows(pending.filter((a) => (a.currentStage ?? 1) === 1)));
    const atStage2 = oldestFirst(approvalRows(pending.filter((a) => a.currentStage === 2)));
    // Above 10 million birr a voucher goes to the Chief Director, not the Department Head
    const forHead = atStage2.filter((r) => !needsChiefDirector(r.total));
    const forChief = atStage2.length - forHead.length;
    const oldestDays = (rows: { lead: TransactionApproval }[]) => (rows.length ? daysSince(dayOf(rows[0].lead), today) : undefined);
    const sentBackByMe = approvalRows(approvals.filter((a) => a.returnedById === me && thisWeek(a.returnedAtGc))).length;
    const endorsedByMe = approvalRows(approvals.filter((a) => a.endorsedById === me && thisWeek(a.endorsedAtGc))).length;
    const approvedByMe = approvalRows(approvals.filter((a) => a.reviewedById === me && a.status === ApprovalStatus.APPROVED && thisWeek(a.reviewedAtGc))).length;

    // The Data Encoder's own requests
    const mine = approvals.filter((a) => a.requestedById === me);
    const myWaiting = oldestFirst(approvalRows(mine.filter((a) => a.status === ApprovalStatus.PENDING)));
    const mySentBack = oldestFirst(approvalRows(mine.filter((a) => a.status === ApprovalStatus.REJECTED)));
    const myThisWeek = approvalRows(mine.filter((a) => thisWeek(dayOf(a)))).length;

    // Items (one per line received, with the pieces issued from it) still on the shelf after the limit
    const shelf = items.filter((i) => [ItemStatus.AVAILABLE, ItemStatus.PENDING_STOCK_OUT, ItemStatus.PENDING_DISPOSAL].includes(i.status));
    const staleItems = new Set(shelf.filter((i) => (daysInStore(i, now) ?? 0) > STALE_IN_STORE_DAYS).map((i) => i.parentItemId ?? i.id)).size;

    // The Department Head's directorate: what is issued to it, as items and fixed-asset units
    const held = items.filter((i) => i.assignedDepartmentId && i.assignedDepartmentId === user?.departmentId && (i.status === ItemStatus.ISSUED || i.status === ItemStatus.UNDER_TRANSFER));
    const heldItems = new Set(held.map((i) => i.parentItemId ?? i.id)).size;
    const heldUnits = held.filter((i) => (i.itemType ?? 'FIXED') === 'FIXED').reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

    return { atStage1, forHead, forChief, oldestDays, sentBackByMe, endorsedByMe, approvedByMe, myWaiting, mySentBack, myThisWeek, staleItems, heldItems, heldUnits };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvals, items, me, user?.departmentId, today]);

  if (loading) return <DashboardSkeleton />;
  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        The dashboard could not be loaded.{' '}
        <button type="button" onClick={load} className="font-semibold underline cursor-pointer">Try again</button>
      </div>
    );
  }
  if (!view) return <p className="text-sm text-slate-600">There is nothing to show here for your role.</p>;

  const toApprovals = () => onNavigate('approvals');
  const toAssets = () => onNavigate('assets');
  const f = figures;
  const waitingNote = (rows: { lead: TransactionApproval }[]) => {
    const d = f.oldestDays(rows);
    return d === undefined ? 'Nothing waiting' : d === 0 ? 'Oldest came in today' : `Oldest waiting ${plural(d, 'day')}`;
  };
  const byType = (rows: { lead: TransactionApproval }[]) => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const noun = requestLabel(r.lead.transactionType, r.lead.requestDetails).noun;
      counts.set(noun, (counts.get(noun) ?? 0) + 1);
    }
    return [...counts.entries()].map(([noun, n]) => `${n} ${noun}${n === 1 ? '' : 's'}`).join(' · ');
  };

  if (view === 'admin') {
    const accounts = people.filter((p) => p.role);
    const canSignIn = accounts.filter((p) => p.isActive);
    // No sign-in times are kept: a temporary password not yet replaced means they haven't signed in since it was set
    const temporary = canSignIn.filter((p) => p.mustChangePassword);
    const deactivated = people.filter((p) => !p.isActive);
    const accessChanges = logs
      .filter((l) => l.entityType === 'USER' || /ROLE|ACCESS|PASSWORD/.test(l.action))
      .sort((x, y) => String(y.timestampGc).localeCompare(String(x.timestampGc)));
    const changesThisWeek = accessChanges.filter((l) => thisWeek(l.timestampGc)).length;
    const byRole = [...canSignIn.reduce((m, p) => m.set(p.role!, (m.get(p.role!) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
    const toUsers = () => onNavigate('settings-users');
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Can sign in" value={plural(canSignIn.length, 'person', 'people')} note={`Of ${plural(people.length, 'employee')} on record`} onClick={toUsers} action="Manage users" />
          <Card
            label="Temporary password"
            value={temporary.length}
            note="Haven't signed in and chosen their own password yet"
            tone={temporary.length ? 'warning' : 'neutral'}
            onClick={toUsers}
            action="See who"
          />
          <Card label="Deactivated" value={plural(deactivated.length, 'employee')} note="Can't sign in or be picked on forms" />
          <Card label="Access changes this week" value={changesThisWeek} note="Roles, permissions and passwords" onClick={() => onNavigate('audit')} action="Audit log" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ListPanel title="Who can sign in, by role" count={byRole.length} empty="Nobody has access yet." action={{ label: 'Manage users', onClick: toUsers }}>
            {byRole.map(([role, n]) => (
              <li key={role} className="flex items-center justify-between py-2 text-xs">
                <span className="text-slate-700">{roleName(role)}</span>
                <span className="font-semibold tabular-nums text-slate-900">{n}</span>
              </li>
            ))}
          </ListPanel>
          <ListPanel title="Recent access changes" count={accessChanges.length} empty="No changes to access yet." action={{ label: 'Audit log', onClick: () => onNavigate('audit') }}>
            {accessChanges.slice(0, 6).map((l) => (
              <li key={l.id} className="py-2 text-xs">
                <p className="truncate text-slate-900">{l.details}</p>
                <p className="text-[11px] text-slate-500">{l.userName} · {l.timestampEc ? `${l.timestampEc} E.C.` : shortDate(l.timestampGc)}</p>
              </li>
            ))}
          </ListPanel>
        </div>
      </div>
    );
  }

  if (view === 'team-leader') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card label="Waiting for my endorsement" value={f.atStage1.length} note={byType(f.atStage1) || 'Nothing waiting'} tone={f.atStage1.length ? 'warning' : 'neutral'} onClick={toApprovals} action="Review" />
          <Card label="Oldest waiting" value={f.oldestDays(f.atStage1) === undefined ? '—' : plural(f.oldestDays(f.atStage1)!, 'day')} note="Since the request came in" />
          <Card label="This week" value={plural(f.endorsedByMe, 'endorsed', 'endorsed')} note={`${plural(f.sentBackByMe, 'sent back', 'sent back')} to the requester`} />
        </div>
        <ListPanel title="Waiting for my endorsement, oldest first" count={f.atStage1.length} empty="Nothing is waiting for you." action={{ label: 'Open approvals', onClick: toApprovals }}>
          {f.atStage1.slice(0, 6).map((r) => <RequestRow key={r.lead.id} lead={r.lead} members={r.members} today={today} />)}
        </ListPanel>
      </div>
    );
  }

  if (view === 'department-head') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Waiting for my approval" value={f.forHead.length} note={waitingNote(f.forHead)} tone={f.forHead.length ? 'warning' : 'neutral'} onClick={toApprovals} action="Review" />
          <Card label="With the Team Leader" value={f.atStage1.length} note="Not yet endorsed" />
          <Card label="This week" value={plural(f.approvedByMe, 'approved', 'approved')} note={`${plural(f.sentBackByMe, 'sent back', 'sent back')} to the requester`} />
          <Card label="My directorate holds" value={plural(f.heldItems, 'item')} note={`${plural(f.heldUnits, 'fixed-asset unit')} issued to it`} onClick={toAssets} action="See assets" />
        </div>
        {f.forChief > 0 && (
          <p className="text-[11px] text-slate-500">{plural(f.forChief, 'request')} above 10 million birr {f.forChief === 1 ? 'goes' : 'go'} to the Chief Director.</p>
        )}
        <ListPanel title="Waiting for my approval, oldest first" count={f.forHead.length} empty="Nothing is waiting for you." action={{ label: 'Open approvals', onClick: toApprovals }}>
          {f.forHead.slice(0, 6).map((r) => <RequestRow key={r.lead.id} lead={r.lead} members={r.members} today={today} />)}
        </ListPanel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Sent back to me" value={f.mySentBack.length} note="To correct and resubmit, or cancel" tone={f.mySentBack.length ? 'warning' : 'neutral'} onClick={toAssets} action="Correct" />
        <Card label="My requests waiting" value={f.myWaiting.length} note={waitingNote(f.myWaiting)} />
        <Card label="In store over 30 days" value={plural(f.staleItems, 'item')} note="Should have been issued by now" tone={f.staleItems ? 'warning' : 'neutral'} onClick={toAssets} action="See them" />
        <Card label="Entered this week" value={plural(f.myThisWeek, 'request')} note="Receipts, issues, transfers and disposals" onClick={toAssets} action="Receive or issue" />
      </div>
      <ListPanel title="Sent back to me" count={f.mySentBack.length} empty="Nothing was sent back to you." action={{ label: 'Open assets', onClick: toAssets }}>
        {f.mySentBack.slice(0, 6).map((r) => (
          <RequestRow
            key={r.lead.id}
            lead={r.lead}
            members={r.members}
            today={today}
            note={[r.lead.returnRemarks?.trim(), r.lead.returnedAtGc ? `rejected ${shortDate(r.lead.returnedAtGc)}` : ''].filter(Boolean).join(' · ')}
          />
        ))}
      </ListPanel>
    </div>
  );
};
