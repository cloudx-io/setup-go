# Local checks

Requires Node.js and Python 3 with PyYAML (`python3 -m pip install PyYAML`).

```sh
python3 -m unittest discover -s tests -v
node --check save-cache/main.js
node --check save-cache/save.js
node --check save-cache/dist/index.js
```

The tests check action wiring, save gating, reverse post-hook ordering, frozen
save inputs, and real trimming of files created before/during a simulated job.
The upload bundle is mocked for the post-wrapper test; actual cache restoration,
uploads, and runner post-job scheduling require a GitHub Actions run.
