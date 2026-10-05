# Project Guidelines & Rules

## Strict System Constraints
- **DO NOT USE `browser_subagent` OR PLAYWRIGHT AUTOMATION.**
  - Invoking `browser_subagent` freezes and hangs the Antigravity IDE on Windows, requiring an IDE restart.
  - All verification must be done via `npm run build`, `npm test`, terminal output, or checking source files.

## Project Scope
- Application: Ministry of Agriculture - Fixed Asset Tracking System (MoA-ATS)
- UI: English-only, clean, modern government design system.
