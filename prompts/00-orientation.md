# Prompt 00 — Orientation (no code)

> Run first. Needs from Yahya: the Gate 1 result, pilot 1, and whether code already exists (docs/14 tasks 1–2).

## Goal
Claude Code knows the whole pack, the environment works, and every contradiction or missing input is listed before any
code is written.

## Read first
`README.md` · `CLAUDE.md` · `DECISIONS.md` (all 50) · `docs/01`–`docs/14` · `docs/research/*` · `data/*.json` ·
`packages/kit/src/*.js` and their tests.

## Do
1. Check the environment: `node -v` (≥ 22.13), `git --version`, `npm test` (the kit's tests must all pass).
2. `git init`, commit the pack exactly as received.
3. Read everything listed. Then write, in your answer, a numbered list (at most 15) of contradictions or gaps between
   `DECISIONS.md`, the docs, the data files and the kit's code, each with file and line and the fix you propose. Say
   "none found" for a category if so. Do not change any file for them yet.
4. List every item marked "to confirm" (docs/11 §11, data files with `toConfirm`/`verified: false`, Darija drafts) and who
   confirms it.
5. Ask Yahya for the three inputs of docs/14 tasks 1–2 if `docs/STATUS.md → Inputs` is empty, and write his answers there.
   If code already exists from the 5 Sep runbook, say what you would do with it (the pack starts from an empty repository;
   old code is not migrated unless Yahya asks).
6. Summarise in five lines what prompts 01–10 will build.

## Constraints
No code, no dependency, no change to decisions. Only `docs/STATUS.md` changes (Inputs, the prompt row).

## Acceptance checks (run them, paste the output)
1. `node -v` and `npm test` output (test count and pass count).
2. The contradictions list and the to-confirm list.
3. `git log --oneline | head -3`.

## Update docs/STATUS.md
Inputs table filled; row 00 done; open items copied from step 4.

## Commit
`chore: build pack as received` (step 2) then `docs: orientation and inputs`
