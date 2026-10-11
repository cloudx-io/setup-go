# Local checks

Requires Node.js 22 or newer and npm. Tests use Node's built-in test runner;
`yaml` is the only dev dependency and is not required by action users.

```sh
npm ci
npm test
npm run check
```

The tests check action wiring, save gating, reverse post-hook ordering, the
primary-key-only lookup used to register saving, and real trimming of files
created before/during a simulated job. Actual cache restoration, uploads, and
runner post-job scheduling require a GitHub Actions run.
