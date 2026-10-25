# Contributing

Thanks for looking. The project is small and the rules are short.

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
./playground.sh up        # the full bundle, see the README
```

- Keep changes focused. Send one topic per pull request, and add tests when logic changes (`packages/core`,
  `apps/bff/test`).
- Core services stay unmodified. Inji Certify and Inji Verify run as released images with configuration only.
- Put a new gap in [docs/gaps.md](docs/gaps.md). Include the versions you saw, the evidence and the steps to
  reproduce it.
- For UI changes, check 390 px and 1440 px. Keep `prefers-reduced-motion` working, and animate `transform` and
  `opacity` only.
- Run `pnpm format` before you commit.
- Don't add real personal data or secrets anywhere. `.env` and the `keys/` directories are git-ignored.

By contributing you agree that your work is licensed under [MPL-2.0](LICENSE).
