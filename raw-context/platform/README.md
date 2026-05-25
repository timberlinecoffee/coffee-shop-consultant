# raw-context/platform/

Drop zone for board-provided reference files used by Groundwork platform work.

## Purpose

This folder is where the board (Trent) drops reference material that platform agents (CTO, engineers, designers, QA) should consult when working on issues in the Groundwork platform repo. It is the canonical "here, look at this" surface for context that lives outside code — screenshots, design refs, voice memos, transcripts, PDFs, competitor captures, anything that informs the work but isn't part of the source tree itself.

## What to drop here

- Screenshots (UI bugs, design comps, references from other products)
- PDFs (specs, vendor docs, legal/compliance docs)
- Design references (Figma exports, mood boards, brand refs)
- Voice memos (`.m4a`, `.mp3`, transcribed or raw)
- Transcripts (Zoom/Meet exports, interview notes)
- Competitor captures (full-page screenshots, recordings)
- Anything else an agent should read for context

Files can be dropped directly at the top level or nested into the optional subfolders below — both are fine.

## Optional subfolders

- `screenshots/` — image captures
- `voice-memos/` — audio + transcripts
- `pdfs/` — PDF documents
- `misc/` — anything that doesn't fit the above

These are conventions, not requirements. The board may use them or drop files at the top level.

## How agents reference these files

Per the AGENTS.md scoping rule, when assigning an issue that requires reading from `raw-context/`, the issue description must name the exact file path. Example:

> Read `raw-context/platform/screenshots/onboarding-mobile-bug.png` and fix the layout issue shown on the third screen.

Agents should not load the entire `raw-context/` directory on startup — only the specific files named in the task. This keeps context tight and predictable.

## Notes

- This is a working drop zone, not a permanent archive. Files may be cleaned up periodically once the work that referenced them is complete and the relevant decisions are captured in code, docs, or issue threads.
- If a file contains secrets, PII, or anything sensitive, do not drop it here — this folder is committed to the public-facing repo.
