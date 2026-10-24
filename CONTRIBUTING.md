# Contributing

Thanks for looking. The project is small and the rules are short.

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
./playground.sh up        # the full bundle, see the README
```

- Keep changes focused. One topic per pull request, with tests when logic changes (`packages/core`,
  `apps/bff/test`).
- Core services stay unmodified: Inji Certify and Inji Verify run as released images with configuration only.
- A new gap goes in [docs/gaps.md](docs/gaps.md) with the versions seen, evidence and steps to reproduce.
- UI changes: check 390 px and 1440 px, keep `prefers-reduced-motion` working, animate `transform` and
  `opacity` only.
- Format with `pnpm format` before committing.
- No real personal data anywhere, and no secrets. `.env` and the `keys/` directories are git-ignored.

By contributing you agree your work is licensed under [MPL-2.0](LICENSE).
