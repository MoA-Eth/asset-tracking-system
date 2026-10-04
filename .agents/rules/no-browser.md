# Disable Browser Subagent and Playwright

## Critical Constraint
- **NEVER use the `browser_subagent` tool.**
- On this Windows system, invoking `browser_subagent` or Playwright causes the Antigravity IDE to freeze and hang indefinitely, forcing a complete restart of the IDE.
- Any subagent, model, or workflow MUST NOT launch or call `browser_subagent`.

## Alternative Verification Methods
- Validate code and UI logic using `npm run build` or `npx tsc --noEmit`.
- Verify dev server status via terminal commands or curl requests.
- Run frontend/backend tests using `npm test` or `npx vitest run`.
