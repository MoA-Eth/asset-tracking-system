// Run against a seeded development/test API; creates and cleans up unused test locations.
const base = (
  process.env.AMS_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');
let passed = 0;
let adminToken;
const createdIds = new Set();

function check(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json();
  return { status: response.status, data: json.data, message: json.message };
}

async function run() {
  const tokens = {};
  for (const account of [
    'sysadmin',
    'encoder',
    'teamleader',
    'depthead',
    'manager',
  ]) {
    const login = await request('/auth/login', undefined, 'POST', {
      usernameOrEmail: `${account}@moa.gov.et`,
      password: 'moaams2024',
    });
    check(login.status === 200, `${account} login failed`);
    tokens[account] = login.data.token;
  }
  adminToken = tokens.sysadmin;
  const payload = {
    siteName: `Location verification ${Date.now()}`,
    building: 'Test Block',
    roomNumber: 'Test Room',
    isCentralStore: false,
  };
  for (const token of [
    undefined,
    tokens.encoder,
    tokens.teamleader,
    tokens.depthead,
    tokens.manager,
  ]) {
    for (const [path, method] of [
      ['/reference/locations', 'POST'],
      ['/reference/locations/LOC-01', 'PUT'],
      ['/reference/locations/LOC-01', 'DELETE'],
    ]) {
      const result = await request(
        path,
        token,
        method,
        method === 'DELETE' ? undefined : payload
      );
      check(
        result.status === (token ? 403 : 401),
        `Unauthorized ${method} was not blocked`
      );
    }
  }
  const malformed = await request('/reference/locations', adminToken, 'POST', {
    ...payload,
    siteName: '   ',
  });
  check(malformed.status === 400, 'Blank site name was accepted');

  const created = await request(
    '/reference/locations',
    adminToken,
    'POST',
    payload
  );
  check(created.status === 201, `Create failed: ${created.message}`);
  createdIds.add(created.data.id);
  check(
    created.data.siteName === payload.siteName,
    'Created site was not persisted'
  );
  const duplicate = await request('/reference/locations', adminToken, 'POST', {
    ...payload,
    siteName: payload.siteName.toUpperCase(),
  });
  check(duplicate.status === 409, 'Case-insensitive duplicate was accepted');

  const updated = await request(
    `/reference/locations/${created.data.id}`,
    adminToken,
    'PUT',
    { ...payload, roomNumber: 'Updated room', isCentralStore: true }
  );
  check(
    updated.status === 200 &&
      updated.data.isCentralStore &&
      updated.data.roomNumber === 'Updated room',
    'Edit was not persisted'
  );
  const registry = await request('/reference/locations', tokens.encoder);
  check(
    registry.data.some(
      (location) =>
        location.id === created.data.id &&
        location.roomNumber === 'Updated room'
    ),
    'Encoder cannot read updated locations'
  );

  const assets = await request('/items', adminToken);
  check(
    assets.data.length > 0,
    'Seeded asset is required for deletion guard verification'
  );
  const protectedLocation = await request(
    `/reference/locations/${assets.data[0].storeLocationId}`,
    adminToken,
    'DELETE'
  );
  check(
    protectedLocation.status === 409,
    'A location linked to assets was deleted'
  );

  const removed = await request(
    `/reference/locations/${created.data.id}`,
    adminToken,
    'DELETE'
  );
  check(removed.status === 200, 'Unused location could not be deleted');
  createdIds.delete(created.data.id);
  const afterDelete = await request('/reference/locations', adminToken);
  check(
    !afterDelete.data.some((location) => location.id === created.data.id),
    'Deleted location remains in registry'
  );
  const logs = await request('/items/audit/logs', adminToken);
  for (const action of [
    'CREATE_LOCATION',
    'UPDATE_LOCATION',
    'DELETE_LOCATION',
  ]) {
    check(
      logs.data.some(
        (log) =>
          log.action === action &&
          log.entityId === created.data.id &&
          log.entityType === 'LOCATION' &&
          log.userRole === 'SYSTEM_ADMIN'
      ),
      `Missing ${action} audit entry`
    );
  }

  // Serializable transactions prevent simultaneous duplicate creation.
  const concurrentPayload = { ...payload, roomNumber: 'Concurrent Room' };
  const concurrent = await Promise.all([
    request('/reference/locations', adminToken, 'POST', concurrentPayload),
    request('/reference/locations', adminToken, 'POST', concurrentPayload),
  ]);
  for (const result of concurrent)
    if (result.status === 201) createdIds.add(result.data.id);
  check(
    concurrent.filter((result) => result.status === 201).length === 1 &&
      concurrent.filter((result) => result.status === 409).length === 1,
    'Concurrent requests created duplicate locations'
  );
  console.log(`LOCATIONS VERIFICATION SUMMARY: ${passed} PASSED, 0 FAILED`);
}

run()
  .catch((error) => {
    console.error(`LOCATIONS VERIFICATION FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const id of createdIds) {
      try {
        const result = await request(
          `/reference/locations/${id}`,
          adminToken,
          'DELETE'
        );
        if (result.status !== 200) throw new Error(result.message);
      } catch (error) {
        console.error(
          `Test location cleanup failed for ${id}: ${error.message}`
        );
        process.exitCode = 1;
      }
    }
  });
