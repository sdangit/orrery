# Branch workflow

- `origin` is `sdangit/orrery`; `upstream` is `TerjeRu/orrery`.
- Keep `main` identical to `upstream/main`; never commit fork-specific work there.
- `macos` is the default integration branch and includes upstream plus our changes.
- Make changes on a sub-branch based on current `origin/macos`; target PRs at `macos`.
- Preserve upstream ancestry when resolving sync conflicts: merge `origin/main`
  on a sub-branch and merge that PR with a merge commit, rather than squashing it.
- See `CONTRIBUTING.md` and `.github/workflows/sync-upstream.yml` for sync details.
