# Project Guidelines & Rules

## Strict System Constraints
- **DO NOT USE `browser_subagent` OR PLAYWRIGHT AUTOMATION.**
  - Invoking `browser_subagent` freezes and hangs the Antigravity IDE on Windows, requiring an IDE restart.
  - Verify with `npm run build`, `npm test`, terminal output, or checking source files.
- **Claude in Chrome (the browser extension, `mcp__claude-in-chrome__*` tools) is allowed.**
  - It drives the user's own Chrome outside the IDE, so it doesn't cause the freeze above.
  - Use it to click through the app, check printed vouchers, and read console or network errors, after tests and builds pass.
  - Work in a new tab, leave the user's other tabs alone, and don't trigger browser alert/confirm dialogs.

## Project Scope
- Application: Ministry of Agriculture - Fixed Asset Tracking System (MoA-ATS)
- UI: English-only, clean, modern government design system.
