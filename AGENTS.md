# Tir

A personal desktop screenwriting application for feature films, for one
writer on NixOS. The writer and the person directing development are the
same person, called "the user" here.

## Documents

Read only what the task needs.

| Document | Holds | Read when |
| --- | --- | --- |
| [Plan](docs/plan.md) | The ordered task list with progress, reviews, user checks and known gaps | First: "Current status", then the task you are taking |
| [Product brief](docs/brief.md) | Intended behaviour, the user's decisions, and shared terms | When working on product behaviour or terminology; read the relevant sections |
| [Architecture](docs/architecture.md) | Design rules, where things live, the library on disk, and how to run and check things | Before touching a part you have not read; "Working here" before running anything |
| [Findings](docs/findings.md) | Outside-world facts the code depends on (Final Draft's format, Fountain, the toolchain) and rejected designs | When touching that topic, or before trying an approach that may have been rejected |
| [Prototype index](docs/prototype/index.html) | The chosen screen designs, and the ones not chosen | When a task builds or changes a screen |

Use the terms as `brief.md` defines them (library, project, draft, active
draft, fork, element, saved, backed up). Do not introduce synonyms in code
or documents.

## Finding things

- Use codebase-memory for cross-file structure and change impact once code
  exists; read known files directly and search for exact literals.
- Check Context7 before adding or debugging library, framework or CLI
  calls (Tauri, ProseMirror, the PDF and spell-check libraries).

## How to work a task

`docs/plan.md` is the task list, and the implement skill works from it
directly. Its "How to work this plan" section is the procedure; in short:

1. Take the first unchecked task in `docs/plan.md`, unless the user names
   another. Set its status to `in progress` and update "Current status".
2. Do that task only. If it turns out to be too large, split it in the
   plan (keeping IDs, adding `0.4a` and so on) and finish the first part.
3. Verify the task's "Done when" with observed evidence. Use the smallest
   check that covers the change; see architecture.md's
   [Running and checking](docs/architecture.md#running-and-checking) for
   when to run the full gate.
4. Review the change, code and tests, with the user-code-review skill
   before calling it done. The plan's "Review: …" tasks add a deeper,
   scheduled review with their own checklists.
5. Update the documents, as "Keeping the documents" says.
6. Check the task off in the plan with an `Evidence:` line, and update
   "Current status".
7. Report what you checked and what you could not check. Continue to the
   next task only if the user asked for more than one. Always stop at a
   "User check: …" task and ask the user to run it.

If a task's premise is wrong (a library behaves differently, a design rule
does not hold), stop, record the finding in `docs/findings.md`, update the
plan, and tell the user. Do not build around a design rule silently.

A stage is finished only when the user has passed its user check. Do not
start the next stage before that.

## Keeping the documents

Write what a later agent needs and cannot get more cheaply from the code.

| What you learned | Where it goes |
| --- | --- |
| How the system behaves | nowhere: the code and its tests say it |
| Why a piece of code is the way it is | a short comment beside that code |
| A new module, folder, or way of running and checking things | `architecture.md`, in place |
| Product behaviour or a choice the user made | `brief.md`, in the present tense |
| An outside-world fact found by experiment, or a rejected design costly to retry | `findings.md`, under its heading |
| A gap left open | the plan, on the task or stage that will close it, otherwise "Known gaps" |
| Something a machine needs that a clone does not bring | `architecture.md`, "Setting up a machine" |

Describe the present: rewrite or delete text a change makes false. Keep one
place per fact and point to it elsewhere.

## Working with the user

The user delegates technical choices and design choices they have no basis
to judge. Ask only about the experience, or a trade-off whose answer
changes what gets built. The chosen prototype pieces are the visual
reference; a visible change beyond them is a design question, best shown
to the user as a new prototype piece.

## Project rules

- **Tests and trial runs never use the real library (`~/Screenplays`), the
  real settings file or a real GitHub repository.** Use temporary
  directories (`TIR_CONFIG_DIR` for the settings) and a local bare git
  repository.
- **Tir writes only inside the library**, apart from its own settings file
  in its config directory (architecture, design rule 4). Imports never
  write to their source file; exports never overwrite one.
- **`src/core/` imports nothing from the DOM, ProseMirror or Tauri.**
- **The browser never wraps script text**; the layout engine places every
  line and page break (architecture, design rule 1).
- **Other people's scripts never enter version control**: calibration PDFs
  and sample FDX files stay in ignored folders. Test fixtures are original.
- Leave `docs/brief.md` decisions alone unless the user changes them;
  propose changes instead.
- Do not add a dependency without saying why in your report.

## Tooling

- Two machines: the user works on a NixOS desktop (often remotely) and a
  NixOS laptop, and moves work between them through GitHub, often pulling
  onto the laptop for visual checks. A clone plus "Setting up a machine" in
  architecture.md must be enough to build, run and check Tir.

- NixOS: system libraries come from the Nix development shell; runtimes and
  tools from `mise.toml`. Run commands with `mise exec -- <command>`
  inside the shell. "Working here" in architecture.md gives the commands.
- pnpm for JavaScript; keep the supply-chain settings and commit
  `pnpm-lock.yaml` and `Cargo.lock`.
