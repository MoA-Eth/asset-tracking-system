const BASE_URL = 'http://localhost:3000/api';

const USERS = {
  admin: { email: 'sysadmin@moa.gov.et', password: 'moaams2024', role: 'SYSTEM_ADMIN' },
  encoder: { email: 'encoder@moa.gov.et', password: 'moaams2024', role: 'DATA_ENCODER' },
  teamlead: { email: 'teamleader@moa.gov.et', password: 'moaams2024', role: 'TEAM_LEADER' },
  head: { email: 'depthead@moa.gov.et', password: 'moaams2024', role: 'DEPARTMENT_HEAD' },
  manager: { email: 'manager@moa.gov.et', password: 'moaams2024', role: 'MANAGER' },
};

const tokens = {};
const userProfiles = {};
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

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('========================================================');
  console.log(' MoA ATS Critical Flows & Functionalities Verification ');
  console.log('========================================================\n');

  // ── TEST SUITE 1: Authentication for All Roles ────────────────────────
  console.log('▶ [1/6] Testing Authentication for All Statutory Roles...');
  for (const [key, creds] of Object.entries(USERS)) {
    try {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { usernameOrEmail: creds.email, password: creds.password },
      });
      assert(res.ok && res.data.success === true, `Login successful for ${creds.role} (${creds.email})`);
      tokens[key] = res.data.data.token;
      userProfiles[key] = res.data.data.user;
      assert(res.data.data.user.role === creds.role, `Token matches role ${creds.role}`);
    } catch (err) {
      assert(false, `Login failed for ${creds.email}: ${err.message}`);
    }
  }

  // ── TEST SUITE 2: Segregation of Duties (SOD) Enforcement ─────────────
  console.log('\n▶ [2/6] Testing Segregation of Duties (SOD) Invariants...');
  try {
    const res = await request('/items/stock-in', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.admin}` },
      body: { name: 'Illegal Admin Item', category: 'IT_EQUIPMENT', ifmisSlipNumber: 'ILLEGAL-01' },
    });
    assert(
      res.status === 403,
      'SYSTEM_ADMIN blocked from Stock-In with 403 Forbidden (SOD Enforced)'
    );
  } catch (err) {
    assert(false, `Unexpected error testing SOD: ${err.message}`);
  }

  // ── TEST SUITE 3: Stock-In Lifecycle & 2-Stage Approval ─────────────────
  console.log('\n▶ [3/6] Testing Full 2-Stage Inbound Stock-In Workflow...');
  const testSlipNumber = `DEMO-GRN-${Date.now().toString().slice(-6)}`;
  let testItemId = null;
  let testApprovalId = null;

  try {
    // 3a. Data Encoder registers Stock-In
    const stockInRes = await request('/items/stock-in', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.encoder}` },
      body: {
        name: 'Demo Lenovo ThinkPad P16 Workstation',
        category: 'IT_EQUIPMENT',
        serialNumber: `SN-LENOVO-${Date.now().toString().slice(-5)}`,
        unitCostETB: 120000,
        storeLocationId: 'LOC-01',
        ifmisSlipNumber: testSlipNumber,
        ifmisSlipDateGc: '2024-03-29',
        ifmisSlipAttachmentUrl: 'https://moa.gov.et/slips/demo_model_19.pdf',
        registeredById: userProfiles.encoder.id,
        notes: 'High-performance demo workstation for engineering',
      },
    });
    assert(stockInRes.status === 201, `Stock-In registered by Data Encoder with slip ${testSlipNumber}`);
    testItemId = stockInRes.data.data.item.id;
    assert(stockInRes.data.data.item.status === 'PENDING_STOCK_IN', 'Item status is PENDING_STOCK_IN');

    // 3b. Find the pending approval
    const pendingRes = await request('/items/approvals/pending', {
      headers: { Authorization: `Bearer ${tokens.teamlead}` },
    });
    const approval = pendingRes.data.data.find((a) => a.ifmisSlipNumber === testSlipNumber);
    assert(!!approval, 'Pending approval workflow created and found in queue');
    testApprovalId = approval.id;
    assert(approval.currentStage === 1, 'Approval initial stage is Stage 1 (Team Leader)');

    // 3c. Verify Department Head CANNOT approve Stage 1 directly
    const prematureRes = await request('/items/approvals/action', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.head}` },
      body: { approvalId: testApprovalId, action: 'APPROVE', reviewRemarks: 'Premature approval attempt' },
    });
    assert(
      prematureRes.status === 500 || prematureRes.status === 400,
      'Sequence Guard: Stage 2 approval rejected before Stage 1 endorsement'
    );

    // 3d. Team Leader Endorses Stage 1
    const endorseRes = await request('/items/approvals/action', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.teamlead}` },
      body: {
        approvalId: testApprovalId,
        action: 'ENDORSE',
        reviewRemarks: 'Stage 1 verified against IFMIS GRN Model 19 physical slip',
      },
    });
    assert(endorseRes.status === 200, 'Stage 1 Endorsed by Team Leader');
    assert(endorseRes.data.data.currentStage === 2, 'Workflow advanced to Stage 2 (Awaiting Directorate Head)');

    // 3e. Department Head Grants Stage 2 Final Approval
    const approveRes = await request('/items/approvals/action', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.head}` },
      body: {
        approvalId: testApprovalId,
        action: 'APPROVE',
        reviewRemarks: 'Stage 2 Final Sign-Off granted for inventory admission',
      },
    });
    assert(approveRes.status === 200, 'Stage 2 Final Approval granted by Department Head');
    assert(approveRes.data.data.status === 'APPROVED', 'Approval status finalized as APPROVED');

    // 3f. Verify Asset is now AVAILABLE in Store
    const itemCheck = await request(`/items/${testItemId}`, {
      headers: { Authorization: `Bearer ${tokens.encoder}` },
    });
    assert(itemCheck.data.data.status === 'AVAILABLE', 'Asset status transitioned atomically to AVAILABLE');
  } catch (err) {
    assert(false, `Stock-In workflow error: ${err.message}`);
  }

  // ── TEST SUITE 4: Stock-Out (Issuance) & Approval Lifecycle ────────────
  console.log('\n▶ [4/6] Testing Full Outbound Stock-Out (Model 20) Workflow...');
  const outSlipNumber = `DEMO-SIV-${Date.now().toString().slice(-6)}`;
  let outApprovalId = null;

  try {
    // 4a. Data Encoder requests Stock-Out to an employee
    const stockOutRes = await request('/items/stock-out', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.encoder}` },
      body: {
        itemId: testItemId,
        recipientEmployeeId: 'EMP-STAFF-02', // Hiwot Tesfaye
        targetDepartmentId: 'DEP-04',
        ifmisSlipNumber: outSlipNumber,
        ifmisSlipDateGc: '2024-03-29',
        ifmisSlipAttachmentUrl: 'https://moa.gov.et/slips/demo_model_20.pdf',
        registeredById: userProfiles.encoder.id,
        purpose: 'Issued for spatial data processing demo',
      },
    });
    assert(stockOutRes.status === 201, `Stock-Out requested with voucher ${outSlipNumber}`);
    assert(stockOutRes.data.data.status === 'PENDING', 'Approval record status is PENDING');
    outApprovalId = stockOutRes.data.data.id;

    // Check item status is now PENDING_STOCK_OUT
    const itemPendingCheck = await request(`/items/${testItemId}`, {
      headers: { Authorization: `Bearer ${tokens.encoder}` },
    });
    assert(itemPendingCheck.data.data.status === 'PENDING_STOCK_OUT', 'Item status is PENDING_STOCK_OUT');

    // 4b. Team Leader Endorses Stage 1
    const outEndorse = await request('/items/approvals/action', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.teamlead}` },
      body: {
        approvalId: outApprovalId,
        action: 'ENDORSE',
        reviewRemarks: 'Model 20 store voucher verified by team lead',
      },
    });
    assert(outEndorse.data.data.currentStage === 2, 'Stock-out advanced to Stage 2');

    // 4c. Department Head Final Approves Stage 2
    const outApprove = await request('/items/approvals/action', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.head}` },
      body: {
        approvalId: outApprovalId,
        action: 'APPROVE',
        reviewRemarks: 'Authorized and released to recipient custodian',
      },
    });
    assert(outApprove.data.data.status === 'APPROVED', 'Stock-out approved');

    // 4d. Verify Asset is now ISSUED with Custodian assigned
    const itemOutCheck = await request(`/items/${testItemId}`, {
      headers: { Authorization: `Bearer ${tokens.encoder}` },
    });
    assert(itemOutCheck.data.data.status === 'ISSUED', 'Asset status is ISSUED');
    assert(itemOutCheck.data.data.currentCustodianId === 'EMP-STAFF-02', 'Custodian liability assigned to employee');
  } catch (err) {
    assert(false, `Stock-Out workflow error: ${err.message}`);
  }

  // ── TEST SUITE 5: Asset Custody Transfer (Model 22) ───────────────────
  console.log('\n▶ [5/6] Testing Custody Transfer & Movement History...');
  try {
    const transferRes = await request('/items/transfer', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.encoder}` },
      body: {
        itemId: testItemId,
        toEmployeeId: 'EMP-STAFF-01', // Transfer from Hiwot to Kebede
        toDepartmentId: 'DEP-01',
        reason: 'Reassigned for field expedition demo',
        performedById: userProfiles.encoder.id,
        model21No: `M21-DEMO-${Date.now().toString().slice(-6)}`,
      },
    });
    assert(transferRes.status === 200, 'Transfer request submitted');
    const transferApproval = transferRes.data.data;
    assert(transferApproval.transactionType === 'TRANSFER' && transferApproval.status === 'PENDING', 'TRANSFER approval opened at Stage 1');

    const pendingItem = await request(`/items/${testItemId}`, { headers: { Authorization: `Bearer ${tokens.encoder}` } });
    assert(pendingItem.data.data.status === 'UNDER_TRANSFER', 'Item held UNDER_TRANSFER while pending');
    assert(pendingItem.data.data.currentCustodianId === 'EMP-STAFF-02', 'Custodian unchanged until approval');

    await request('/items/approvals/action', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.teamlead}` },
      body: { approvalId: transferApproval.id, action: 'ENDORSE' },
    });
    await request('/items/approvals/action', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.head}` },
      body: { approvalId: transferApproval.id, action: 'APPROVE' },
    });

    const transferredItem = await request(`/items/${testItemId}`, { headers: { Authorization: `Bearer ${tokens.encoder}` } });
    assert(transferredItem.data.data.currentCustodianId === 'EMP-STAFF-01', 'Custodian updated to new employee after Stage 2');
    assert(transferredItem.data.data.status === 'ISSUED', 'Item back to ISSUED after transfer approval');
    assert(
      transferredItem.data.data.history.some((h) => h.action === 'TRANSFER_APPROVED'),
      'TRANSFER_APPROVED recorded in immutable asset movement history'
    );
  } catch (err) {
    assert(false, `Transfer error: ${err.message}`);
  }

  // ── TEST SUITE 6: Executive Dashboard & Audit Log Integrity ───────────
  console.log('\n▶ [6/6] Testing Executive Dashboard & Statutory Audit Logs...');
  try {
    const dashRes = await request('/items/dashboard/executive', {
      headers: { Authorization: `Bearer ${tokens.manager}` },
    });
    assert(dashRes.status === 200, 'Executive Dashboard data retrieved for MANAGER');
    assert(dashRes.data.data.totalItems >= 1, `Dashboard shows ${dashRes.data.data.totalItems} total portfolio items`);
    assert(dashRes.data.data.totalValuationETB > 0, `Portfolio valuation computed: ${dashRes.data.data.totalValuationETB} ETB`);

    const auditRes = await request('/items/audit/logs', {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    assert(auditRes.status === 200, 'Audit logs retrieved for SYSTEM_ADMIN');
    assert(auditRes.data.data.length > 0, `Audit log contains ${auditRes.data.data.length} immutable events`);
    const hasOurDemoEvents = auditRes.data.data.some((l) => l.ifmisSlipNumber === testSlipNumber || l.ifmisSlipNumber === outSlipNumber);
    assert(hasOurDemoEvents, 'Audit trail verified containing exact slips from this test run');
  } catch (err) {
    assert(false, `Dashboard/Audit error: ${err.message}`);
  }

  // ── TEST SUITE 7: Reports Tabular Queries & Reference Data ─────────────
  console.log('\n▶ [7/7] Testing Tabular Reports Queries & Reference Integrity...');
  try {
    // 7a. Report query for AVAILABLE items
    const availRes = await request('/items?status=AVAILABLE', {
      headers: { Authorization: `Bearer ${tokens.head}` },
    });
    assert(availRes.status === 200, 'Reports API accepts status=AVAILABLE query');
    assert(Array.isArray(availRes.data.data), 'Returns array of assets');
    const allAvailable = availRes.data.data.every((i) => i.status === 'AVAILABLE');
    assert(allAvailable, 'All items in available report strictly match AVAILABLE status');

    // 7b. Report query for ISSUED items
    const issuedRes = await request('/items?status=ISSUED', {
      headers: { Authorization: `Bearer ${tokens.head}` },
    });
    assert(issuedRes.status === 200, 'Reports API accepts status=ISSUED query');
    const allIssued = issuedRes.data.data.every((i) => i.status === 'ISSUED');
    assert(allIssued, 'All items in issued report strictly match ISSUED status');

    // 7c. Reference data integrity
    const deptsRes = await request('/reference/departments', {
      headers: { Authorization: `Bearer ${tokens.encoder}` },
    });
    assert(deptsRes.status === 200 && deptsRes.data.data.length >= 3, `Departments reference data verified (${deptsRes.data.data.length} depts)`);

    const locsRes = await request('/reference/locations', {
      headers: { Authorization: `Bearer ${tokens.encoder}` },
    });
    assert(locsRes.status === 200 && locsRes.data.data.length >= 2, `Locations reference data verified (${locsRes.data.data.length} locations)`);

    // 7d. Additional SOD boundary tests
    const encoderApprovalAttempt = await request('/items/approvals/action', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.encoder}` },
      body: { approvalId: 'test-id', action: 'APPROVE', reviewRemarks: 'Unauthorized attempt' },
    });
    assert(
      encoderApprovalAttempt.status === 403,
      'SOD Guard: DATA_ENCODER strictly forbidden from granting approvals (403 Forbidden)'
    );

    const adminStockOutAttempt = await request('/items/stock-out', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.admin}` },
      body: { itemId: testItemId, recipientEmployeeId: 'EMP-STAFF-01', purpose: 'test', ifmisSlipNumber: 'SOD-FAIL' },
    });
    assert(
      adminStockOutAttempt.status === 403,
      'SOD Guard: SYSTEM_ADMIN strictly forbidden from requesting Stock-Out (403 Forbidden)'
    );
  } catch (err) {
    assert(false, `Reports/SOD error: ${err.message}`);
  }

  console.log('\n========================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
