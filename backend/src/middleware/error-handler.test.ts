import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from './error-handler';
import { ConflictError, DATABASE_UNAVAILABLE_MESSAGE } from '../errors/app-error';

const run = (err: any) => {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  errorHandler(err, {} as any, res, vi.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
};

// Shaped like the errors the Prisma client throws
const prismaError = (name: string, message: string, code?: string) =>
  Object.assign(new Error(message), { name, ...(code ? { code } : {}) });

describe('errorHandler', () => {
  it('answers a database outage with 503 and a plain message', () => {
    const { status, body } = run(
      prismaError(
        'PrismaClientInitializationError',
        "Invalid `prisma.employee.findFirst()` invocation in auth.service.ts:43:39 Can't reach database server at `localhost:5432`"
      )
    );
    expect(status).toBe(503);
    expect(body.message).toBe(DATABASE_UNAVAILABLE_MESSAGE);
    expect(body.message).not.toMatch(/prisma|localhost/i);
  });

  it('treats Prisma connection codes as an outage too', () => {
    expect(run(prismaError('PrismaClientKnownRequestError', 'Server has closed the connection.', 'P1017')).status).toBe(503);
  });

  it('hides the raw message of other Prisma errors', () => {
    const { status, body } = run(prismaError('PrismaClientKnownRequestError', 'Invalid `prisma.item.update()` invocation ...', 'P2025'));
    expect(status).toBe(500);
    expect(body.message).not.toMatch(/prisma/i);
  });

  it('answers a request body that cannot be read with 400, not a server error', () => {
    const broken = Object.assign(new SyntaxError("Expected ',' or '}' after property value in JSON"), { type: 'entity.parse.failed', status: 400 });
    expect(run(broken)).toMatchObject({ status: 400, body: { message: 'The request could not be read. Check the data and try again.' } });
    expect(run(Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 })).status).toBe(413);
  });

  it('keeps the message of app errors and plain business-rule errors', () => {
    expect(run(new ConflictError('Already endorsed.'))).toMatchObject({ status: 409, body: { message: 'Already endorsed.' } });
    expect(run(new Error('Item must be AVAILABLE to register Stock-Out.')).body.message).toBe('Item must be AVAILABLE to register Stock-Out.');
  });
});
