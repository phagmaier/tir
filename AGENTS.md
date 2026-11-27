# Tir

A personal desktop screenwriting application for feature films, for one
writer on NixOS. The writer and the person directing development are the
same person, called "the user" here.

## Documents

Read only what the task needs.

| Document | Holds | Read when |
| --- | --- | --- |
| [Plan](docs/plan.md#current-status) | Active tasks, reviews, user checks and known gaps | For planned implementation: read "Current status", then the assigned task |
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

## Planned implementation

Use the implement skill and follow [How to work this plan](docs/plan.md#how-to-work-this-plan)
for task selection, status, evidence, and the stage gates. A question,
audit, or standalone maintenance request does not start a plan task.
Use the adopted `code-review` method for implementation reviews (named
`user-code-review` in Claude Code, not its bundled `/code-review`).

## Keeping the documents

Write what a later agent needs and cannot get more cheaply from the code.

| What you learned | Where it goes |
| --- | --- |
| Implementation details | Code and tests; put local rationale beside the code |
| Design rules, subsystem boundaries, disk formats, build or check workflows | `architecture.md` |
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

- **Tests and trial runs never use the real library, real settings, or a
  real GitHub repository.** Use the [isolated launch](docs/architecture.md#running-and-checking),
  temporary test directories, and a local bare git repository.
- **Tir writes inside the library or its own settings file.** An export
  may also create a new file at a destination picked in the native Save
  dialog; it never replaces an existing file. Import sources are read-only.
- **`src/core/` imports nothing from the DOM, ProseMirror or Tauri.**
- **The browser never wraps script text**; the layout engine places every
  line and page break (architecture, design rule 1).
- **Other people's scripts never enter version control**: calibration PDFs
  and sample FDX files stay in ignored folders. Test fixtures are original.
- Leave `docs/brief.md` decisions alone unless the user changes them;
  propose changes instead.
- Do not add a dependency without saying why in your report.

## Commits and pushes

The user gives agents standing permission to commit verified, in-scope
work and push it to the current Tir branch's configured upstream on
GitHub. Commit and push at useful checkpoints or at completion, at your
discretion. Neither is required, and no separate approval is needed.

Keep unrelated edits, credentials, private scripts, and real settings out
of commits. Preserve other people's staged work. Push normally, without
force or unrelated commits. If there is no configured upstream or a
normal push is rejected, leave the commit local and report why.

## Tooling

- [Working here](docs/architecture.md#working-here) covers the Nix shell,
  mise, setup on both machines, and focused checks.
- Keep the pnpm supply-chain settings and both lockfiles (`pnpm-lock.yaml`
  and `Cargo.lock`).
