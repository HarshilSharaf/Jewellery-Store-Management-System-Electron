# Submodule workflow

The Angular application lives in a Git submodule at
[`client/`](../../client/). The parent repository holds Electron, backend
services, SQL scripts, Docker infra, and this documentation. The submodule
holds the Angular components, routing, and shared UI services.

## Cloning

Always include submodules on clone:

```bash
git clone --recurse-submodules <parent-repo-url>
```

Missed it? Recover with:

```bash
git submodule update --init --recursive
```

`git status` in the parent will show `client` as an untracked commit if the
submodule directory is empty; running the command above populates it.

## Day-to-day workflow

When you edit files under `client/`, git sees **two separate repositories**:

- The parent repo tracks a **pointer** (a commit SHA) into the submodule.
- The submodule repo tracks the actual file changes.

Standard sequence for a change that spans both:

```bash
# 1. inside the submodule
cd client
git checkout <branch>          # or create one
# ... edit ...
git add <files>
git commit -m "feat(customers): ..."
git push origin <branch>

# 2. back in the parent
cd ..
git add client                 # records the new submodule SHA
git commit -m "chore: bump client submodule to <sha>"
git push
```

If you only touch parent-repo files, ignore the submodule. `git status` will
still show `client` as "new commits" if the submodule branch is ahead of the
recorded pointer - that's a signal to bump.

## Branch names

Match the branch name across parent and submodule when they change in lockstep
for a feature (e.g. both on `feature/ui-refresh`). This makes it obvious that
they belong together.

## Common pitfalls

- **Detached HEAD in the submodule.** `git submodule update` checks the
  submodule out at the recorded SHA, which puts it in detached HEAD. Before you
  edit, `cd client && git checkout <branch>` explicitly.
- **Forgetting to bump the pointer.** You commit inside `client/`, push, then
  forget to `git add client` in the parent. Anyone else who clones the parent
  gets the OLD submodule SHA. Symptom: your change "isn't there" for other
  people.
- **Diverged pointer.** If two branches in the parent both bump `client` to
  different SHAs, merging the parent will produce a submodule pointer conflict.
  Resolve by picking the SHA you want and re-running `git add client`.
- **Renaming inside the submodule shows as huge diff in parent.** It doesn't -
  the parent only sees the SHA change. If you see a giant diff, you're inside
  the submodule directory, not the parent.

## Cross-cutting refactors

For work that has to touch both parent files and submodule files in the same PR:

1. Land the submodule change first (its own PR on the submodule repo).
2. Land the parent change referencing the new submodule SHA.

CI runs on the parent PR only after the submodule PR has merged. This ordering
avoids reviewers seeing a "phantom" SHA that doesn't exist on the submodule's
main branch yet.

## Documenting the submodule

The submodule ships its own `client/README.md`. It is **owned by the submodule
repository** - do not edit it from within a parent-repo checkout unless you
also commit and push inside the submodule. See the coordination-requests file
at the repo root if this docs workstream has proposed updates to it.

## Removing the submodule (theoretical)

If we ever decide to inline the Angular app back into the parent, the
mechanical steps are:

1. `git submodule deinit -f client`
2. `git rm -f client`
3. `rm -rf .git/modules/client`
4. Copy the submodule's content in as regular files.
5. Commit.

There is no plan to do this currently. The submodule split keeps the parent
repo lean and lets frontend and infra work proceed on separate branches without
conflict.
