# Fork workflow

This fork tracks [TerjeRu/orrery](https://github.com/TerjeRu/orrery).

- `main` mirrors `upstream/main`. Do not put fork-specific commits or PRs on it.
- `macos` is the default and integration branch. It contains upstream history plus our changes.
- Develop on sub-branches created from the latest `origin/macos`, and open PRs targeting `macos`.

Start a change:

```sh
git fetch origin
git switch -c feat/my-change origin/macos
```

Keep an existing development branch current:

```sh
git fetch origin
git merge origin/macos
```

Push it and open a PR:

```sh
git push -u origin HEAD
gh pr create --base macos
```

## Upstream synchronization

The **Sync upstream** GitHub Actions workflow runs hourly, on pushes to `macos`,
and manually from the Actions tab. GitHub may delay scheduled runs or disable
scheduled workflows after prolonged repository inactivity.

It fast-forwards `main` to `upstream/main`, then merges `main` into `macos`.
It never force-pushes. If `main` has diverged, a merge conflicts, or another push
wins a race, the run fails without overwriting remote changes. Inspect failed
runs in Actions; resolve conflicts on a development branch:

```sh
git fetch origin
git switch -c chore/resolve-upstream origin/macos
git merge origin/main
# Resolve conflicts, validate the combined changes, and commit the merge.
git push -u origin HEAD
gh pr create --base macos
```

Merge upstream conflict-resolution PRs with **Create a merge commit** so that
upstream ancestry is preserved. After the PR lands, rerun **Sync upstream**.

For a new clone, add the upstream remote if needed:

```sh
git remote add upstream https://github.com/TerjeRu/orrery.git
```
