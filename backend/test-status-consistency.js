/**
 * MoA-AMS Deep Status Transition & Data Consistency Verification Test
 * Verifies before/after statuses, store availability, custodian liability,
 * and rejection rollbacks across all scenarios.
 */

const BASE_URL = 'http://localhost:3000/api';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function request(endpoint, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data: data ? (data.data !== undefined ? data.data : data) : null };
}

async function login(usernameOrEmail, password = 'moaams2024') {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { usernameOrEmail, password },
  });
  if (!res.ok) throw new Error(`Login failed for ${usernameOrEmail}`);
  return res.data.token;
}

async function runStatusConsistencyTests() {
  console.log('================================================================');
  console.log('  MoA-AMS Deep Status Transition & Consistency Verification     ');
  console.log('================================================================\n');

  try {
    // 0. Authenticate Personas
    const encoderToken = await login('encoder@moa.gov.et');
    const teamleadToken = await login('teamlead@moa.gov.et');
    const headToken = await login('head@moa.gov.et');
    const adminToken = await login('admin@moa.gov.et');

    // Get reference employees and locations
    const empsRes = await request('/reference/employees', {}, encoderToken);
    const locsRes = await request('/reference/locations', {}, encoderToken);
    const emp1 = empsRes.data[0];
    const emp2 = empsRes.data[1] || empsRes.data[0];
    const storeLoc = locsRes.data[0].id;

    // =========================================================================
    // SCENARIO 1: Stock-In 2-Stage Approval -> Transition to AVAILABLE
    // =========================================================================
    console.log('▶ [Scenario 1] Model 19 Stock-In (Full 2-Stage Approval)');
    const ts1 = Date.now().toString().slice(-6);
    const m19Slip = `SC1-M19-${ts1}`;

    // 1a. Register Stock-In
    const regRes = await request('/items/stock-in', {
      method: 'POST',
      body: {
        name: `Precision Flow Meter ${ts1}`,
        category: 'AGRI_MACHINERY',
        serialNumber: `PFM-${ts1}`,
        unitCostETB: 88000,
        condition: 'NEW',
        storeLocationId: storeLoc,
        ifmisSlipNumber: m19Slip,
        ifmisSlipDateGc: '2026-09-29',
        ifmisSlipAttachmentUrl: 'https://moa.gov.et/slips/m19-sc1.pdf',
        notes: 'Scenario 1 test registration',
      },
    }, encoderToken);
    if (!regRes.ok) console.log('regRes error:', regRes.status, regRes.data);
    assert(regRes.ok, `Stock-In created with slip ${m19Slip}`);
    const item1Id = regRes.data?.item?.id;

    // Check Before Status
    const item1Before = await request(`/items/${item1Id}`, {}, encoderToken);
    assert(item1Before.data.status === 'PENDING_STOCK_IN', 'BEFORE APPROVAL: Item status is strictly PENDING_STOCK_IN');
    assert(item1Before.data.currentCustodianId === null, 'BEFORE APPROVAL: Custodian is null (not issued)');

    // Check approval record initial state
    const pendings1 = await request('/items/approvals/pending', {}, teamleadToken);
    const app1 = pendings1.data.find(a => a.itemId === item1Id);
    assert(app1 && app1.status === 'PENDING', 'Approval record status is PENDING');
    assert(app1.currentStage === 1, 'Approval currentStage is 1 (Team Leader)');

    // 1b. Stage 1 Endorsement
    const end1Res = await request('/items/approvals/action', {
      method: 'POST',
      body: { approvalId: app1.id, action: 'ENDORSE', reviewRemarks: 'Stage 1 Endorsed' },
    }, teamleadToken);
    assert(end1Res.ok, 'Stage 1 Endorsement executed');
    assert(end1Res.data.currentStage === 2, 'Approval advanced to currentStage 2 (Dept Head)');

    // Check intermediate status
    const item1Inter = await request(`/items/${item1Id}`, {}, encoderToken);
    assert(item1Inter.data.status === 'PENDING_STOCK_IN', 'AFTER STAGE 1: Item status remains PENDING_STOCK_IN');

    // 1c. Stage 2 Final Approval
    const appv1Res = await request('/items/approvals/action', {
      method: 'POST',
      body: { approvalId: app1.id, action: 'APPROVE', reviewRemarks: 'Stage 2 Approved' },
    }, headToken);
    assert(appv1Res.ok, 'Stage 2 Final Approval executed');
    assert(appv1Res.data.status === 'APPROVED', 'Approval record status finalized as APPROVED');

    // Check After Status
    const item1After = await request(`/items/${item1Id}`, {}, encoderToken);
    assert(item1After.data.status === 'AVAILABLE', 'AFTER APPROVAL: Item status transitioned atomically to AVAILABLE');
    assert(item1After.data.currentCustodianId === null, 'Custodian liability remains null (in central store stock)');
    assert(item1After.data.history.length >= 3, `Complete lifecycle recorded in item movement history (${item1After.data.history.length} events)`);

    // =========================================================================
    // SCENARIO 2: Stock-In Rejection -> Transition to DISPOSED
    // =========================================================================
    console.log('\n▶ [Scenario 2] Model 19 Stock-In Rejection (Rejected at Stage 1)');
    const ts2 = Date.now().toString().slice(-6);
    const m19RejSlip = `SC2-REJ-${ts2}`;

    const regRejRes = await request('/items/stock-in', {
      method: 'POST',
      body: {
        name: `Defective Sensor Unit ${ts2}`,
        category: 'IT_EQUIPMENT',
        serialNumber: `DEF-${ts2}`,
        unitCostETB: 35000,
        condition: 'NEW',
        storeLocationId: storeLoc,
        ifmisSlipNumber: m19RejSlip,
        ifmisSlipDateGc: '2026-09-29',
        ifmisSlipAttachmentUrl: 'https://moa.gov.et/slips/m19-rej.pdf',
        notes: 'Damaged during transit from port',
      },
    }, encoderToken);
    const item2Id = regRejRes.data.item.id;

    const pendings2 = await request('/items/approvals/pending', {}, teamleadToken);
    const app2 = pendings2.data.find(a => a.itemId === item2Id);

    // Reject at Stage 1 by Team Leader
    const rej1Res = await request('/items/approvals/action', {
      method: 'POST',
      body: { approvalId: app2.id, action: 'REJECT', reviewRemarks: 'Physical defect detected on arrival, rejected' },
    }, teamleadToken);
    assert(rej1Res.ok, 'Rejection processed by Team Leader');
    assert(rej1Res.data.status === 'REJECTED', 'Approval status finalized as REJECTED');

    const item2After = await request(`/items/${item2Id}`, {}, encoderToken);
    assert(item2After.data.status === 'DISPOSED', 'ON REJECTION: Stock-In item status transitioned to DISPOSED (not in stock)');

    // =========================================================================
    // SCENARIO 3: Stock-Out 2-Stage Approval -> Transition to ISSUED
    // =========================================================================
    console.log('\n▶ [Scenario 3] Model 20 Stock-Out (2-Stage Approval & Custody Transfer)');
    const ts3 = Date.now().toString().slice(-6);
    const m20Slip = `SC3-M20-${ts3}`;

    // Item 1 from Scenario 1 is AVAILABLE. Let's issue it!
    const outReqRes = await request('/items/stock-out', {
      method: 'POST',
      body: {
        itemId: item1Id,
        recipientEmployeeId: emp1.id,
        targetDepartmentId: emp1.departmentId || 'DEP-01',
        purpose: 'Agronomy soil test project deployment',
        ifmisSlipNumber: m20Slip,
        ifmisSlipDateGc: '2026-09-29',
      },
    }, encoderToken);
    assert(outReqRes.ok, `Stock-Out requested for item ${item1Id} with voucher ${m20Slip}`);
    const outApprovalId = outReqRes.data.id;

    // Check Status During Stock-Out Request
    const item1DuringOut = await request(`/items/${item1Id}`, {}, encoderToken);
    assert(item1DuringOut.data.status === 'PENDING_STOCK_OUT', 'DURING APPROVAL: Item status is PENDING_STOCK_OUT (locked from re-issue)');
    assert(item1DuringOut.data.currentCustodianId === null, 'DURING APPROVAL: Custodian not yet transferred');

    // Stage 1 Endorse Stock-Out
    const endOutRes = await request('/items/approvals/action', {
      method: 'POST',
      body: { approvalId: outApprovalId, action: 'ENDORSE', reviewRemarks: 'Store voucher verified' },
    }, teamleadToken);
    assert(endOutRes.ok && endOutRes.data.currentStage === 2, 'Stock-Out endorsed by Team Leader (advanced to Stage 2)');

    // Stage 2 Approve Stock-Out
    const appvOutRes = await request('/items/approvals/action', {
      method: 'POST',
      body: { approvalId: outApprovalId, action: 'APPROVE', reviewRemarks: 'Authorized and released to custodian' },
    }, headToken);
    assert(appvOutRes.ok && appvOutRes.data.status === 'APPROVED', 'Stock-Out approved by Directorate Head');

    // Check After Status
    const item1Issued = await request(`/items/${item1Id}`, {}, encoderToken);
    assert(item1Issued.data.status === 'ISSUED', 'AFTER APPROVAL: Item status transitioned to ISSUED');
    assert(item1Issued.data.currentCustodianId === emp1.id, `AFTER APPROVAL: Custodian liability assigned to ${emp1.fullNameEn}`);

    // =========================================================================
    // SCENARIO 4: Stock-Out Rejection -> Reversion to AVAILABLE
    // =========================================================================
    console.log('\n▶ [Scenario 4] Model 20 Stock-Out Rejection (Atomic Reversion to AVAILABLE)');
    const ts4 = Date.now().toString().slice(-6);

    // Create another available item directly (historical stock-in)
    const histRes = await request('/items/stock-in', {
      method: 'POST',
      body: {
        name: `Spare Laptop ${ts4}`,
        category: 'IT_EQUIPMENT',
        serialNumber: `LAP-${ts4}`,
        unitCostETB: 55000,
        condition: 'GOOD',
        storeLocationId: storeLoc,
        ifmisSlipNumber: `HIST-${ts4}`,
        ifmisSlipDateGc: '2026-09-29',
        isHistoricalData: true,
      },
    }, encoderToken);
    const item4Id = histRes.data.item.id;
    assert(histRes.data.item.status === 'AVAILABLE', 'Historical asset created directly with status AVAILABLE');

    // Request Stock-Out
    const out4Res = await request('/items/stock-out', {
      method: 'POST',
      body: {
        itemId: item4Id,
        recipientEmployeeId: emp1.id,
        targetDepartmentId: emp1.departmentId || 'DEP-01',
        purpose: 'Temporary field loan',
        ifmisSlipNumber: `M20-REJ-${ts4}`,
        ifmisSlipDateGc: '2026-09-29',
      },
    }, encoderToken);
    const out4ApprovalId = out4Res.data.id;

    // Check item entered PENDING_STOCK_OUT
    const item4Pending = await request(`/items/${item4Id}`, {}, encoderToken);
    assert(item4Pending.data.status === 'PENDING_STOCK_OUT', 'Item entered PENDING_STOCK_OUT');

    // Reject Stock-Out at Stage 1
    const rejOut4 = await request('/items/approvals/action', {
      method: 'POST',
      body: { approvalId: out4ApprovalId, action: 'REJECT', reviewRemarks: 'Asset required for central office, loan denied' },
    }, teamleadToken);
    assert(rejOut4.ok && rejOut4.data.status === 'REJECTED', 'Stock-Out rejected');

    // Check that item REVERTS to AVAILABLE
    const item4Reverted = await request(`/items/${item4Id}`, {}, encoderToken);
    assert(item4Reverted.data.status === 'AVAILABLE', 'REVERSION: Item reverted atomically back to AVAILABLE');
    assert(item4Reverted.data.currentCustodianId === null, 'REVERSION: Custodian remains null (store property)');

    // =========================================================================
    // SCENARIO 5: Model 22 Return to Store -> Discharge Custody Liability
    // =========================================================================
    console.log('\n▶ [Scenario 5] Model 22 Return to Store (Custody Discharge & Status Transition)');
    const ts5 = Date.now().toString().slice(-6);
    const m22Slip = `SC5-M22-${ts5}`;

    // Item 1 is currently ISSUED to emp1. Return it to store!
    const retRes = await request('/items/return-to-store', {
      method: 'POST',
      body: {
        itemId: item1Id,
        ifmisSlipNumber: m22Slip,
        ifmisSlipDateGc: '2026-09-29',
        returnReason: 'Project concluded, equipment returned in good order',
        condition: 'GOOD',
        returningEmployeeId: emp1.id,
      },
    }, encoderToken);
    assert(retRes.ok, `Return to store requested with Model 22 slip ${m22Slip}`);
    const retApprovalId = retRes.data.id;

    // Guard check: duplicate return request while pending should be rejected
    const dupRetRes = await request('/items/return-to-store', {
      method: 'POST',
      body: {
        itemId: item1Id,
        ifmisSlipNumber: `DUP-${m22Slip}`,
        ifmisSlipDateGc: '2026-09-29',
        returnReason: 'Duplicate attempt',
        condition: 'GOOD',
      },
    }, encoderToken);
    assert(!dupRetRes.ok, 'Concurrency Guard: Duplicate return request rejected while approval is pending');

    // Stage 1 Endorse Return
    const endRetRes = await request('/items/approvals/action', {
      method: 'POST',
      body: { approvalId: retApprovalId, action: 'ENDORSE', reviewRemarks: 'Return condition verified by store team' },
    }, teamleadToken);
    assert(endRetRes.ok && endRetRes.data.currentStage === 2, 'Return endorsed by Team Leader');

    // Stage 2 Approve Return
    const appvRetRes = await request('/items/approvals/action', {
      method: 'POST',
      body: { approvalId: retApprovalId, action: 'APPROVE', reviewRemarks: 'Return acknowledged, inventory replenished' },
    }, headToken);
    assert(appvRetRes.ok && appvRetRes.data.status === 'APPROVED', 'Return approved by Directorate Head');

    // Verify Item after Return
    const item1Returned = await request(`/items/${item1Id}`, {}, encoderToken);
    assert(item1Returned.data.status === 'AVAILABLE', 'AFTER RETURN: Item status transitioned back to AVAILABLE in store');
    assert(item1Returned.data.currentCustodianId === null, 'AFTER RETURN: Custodian liability discharged (cleared to null)');

    // =========================================================================
    // SCENARIO 6: Model 22 Custody Transfer Invariant Guards
    // =========================================================================
    console.log('\n▶ [Scenario 6] Asset Custody Transfer Invariant Guards');

    // Invariant 6a: Cannot transfer DISPOSED item
    const transferDisposed = await request('/items/transfer', {
      method: 'POST',
      body: { itemId: item2Id, toEmployeeId: emp2.id, reason: 'Illegal transfer attempt on disposed asset' },
    }, encoderToken);
    assert(!transferDisposed.ok, 'Status Invariant: Transfer rejected on DISPOSED asset');

    // Invariant 6b: Legitimate custody transfer on issued item
    // First, issue item4 to emp1
    const issueItem4 = await request('/items/stock-out', {
      method: 'POST',
      body: {
        itemId: item4Id,
        recipientEmployeeId: emp1.id,
        targetDepartmentId: emp1.departmentId || 'DEP-01',
        purpose: 'Direct assignment for transfer test',
        ifmisSlipNumber: `M20-XFER-${ts5}`,
        ifmisSlipDateGc: '2026-09-29',
      },
    }, encoderToken);
    await request('/items/approvals/action', { method: 'POST', body: { approvalId: issueItem4.data.id, action: 'ENDORSE' } }, teamleadToken);
    await request('/items/approvals/action', { method: 'POST', body: { approvalId: issueItem4.data.id, action: 'APPROVE' } }, headToken);

    // Transfer item4 from emp1 to emp2
    const transferValid = await request('/items/transfer', {
      method: 'POST',
      body: {
        itemId: item4Id,
        toEmployeeId: emp2.id,
        reason: 'Handover to regional surveyor',
      },
    }, encoderToken);
    assert(transferValid.ok, 'Custody transfer executed successfully');
    assert(transferValid.data.currentCustodianId === emp2.id, `Custody liability transferred to ${emp2.fullNameEn}`);

    // =========================================================================
    // SCENARIO 7: Complete Audit Log & Historical Traceability
    // =========================================================================
    console.log('\n▶ [Scenario 7] Immutable Audit Trail Verification');
    const auditRes = await request('/items/audit/logs', {}, adminToken);
    assert(auditRes.ok && auditRes.data.length > 0, `Audit log contains ${auditRes.data.length} immutable events`);

    const hasM19 = auditRes.data.some(l => l.ifmisSlipNumber === m19Slip);
    const hasM20 = auditRes.data.some(l => l.ifmisSlipNumber === m20Slip);
    const hasM22 = auditRes.data.some(l => l.ifmisSlipNumber === m22Slip);
    assert(hasM19, `Model 19 slip ${m19Slip} recorded in audit trail`);
    assert(hasM20, `Model 20 slip ${m20Slip} recorded in audit trail`);
    assert(hasM22, `Model 22 slip ${m22Slip} recorded in audit trail`);

    console.log('\n================================================================');
    console.log(` CONSISTENCY VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error in consistency testing:', err);
    process.exit(1);
  }
}

runStatusConsistencyTests();
