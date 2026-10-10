# Post-job cache save

This internal action runs the `actions/cache/save` implementation as a
successful-job post hook. Register it before `trim-gocache` so the runner's
reverse post-hook order trims before uploading. Inputs are recorded in action
state during setup and reused after the caller's build/test steps.

`dist/index.js` is copied unchanged from `actions/cache` at
`caa296126883cff596d87d8935842f9db880ef25` (v5), matching the restore action's pin.
The upstream MIT license is in `dist/LICENSE`.

When updating the cache pin in `action.yml`, update the vendored bundle too:

```sh
revision=caa296126883cff596d87d8935842f9db880ef25
curl -fsSL "https://raw.githubusercontent.com/actions/cache/$revision/dist/save-only/index.js" -o save-cache/dist/index.js
curl -fsSL "https://raw.githubusercontent.com/actions/cache/$revision/LICENSE" -o save-cache/dist/LICENSE
```

This avoids a separate dependency/build toolchain while preserving upstream
cache protocol support, warnings, and concurrency handling.
