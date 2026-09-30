# setup-go

A drop-in replacement for [`actions/setup-go`](https://github.com/actions/setup-go).

Use this to efficiently parallelize your golang lint, build, and test jobs. They each get their own cache entry and don't conflict with each other. The cache is updated after every run so every time you merge a PR, CI only builds and tests the packages that have changed. We accomplish this by installing go and caching `GOCACHE` and `GOMODCACHE` with job-specific cache keys.

For a much deeper technical dive on how this works, read [our post on the CloudX blog](https://www.cloudx.ai/posts/setup-go).

## Usage

```yaml
- uses: cloudx-io/setup-go@v1
  with:
    go-version: "1.26.1"
    cache-key-prefix: "test"
```

Give every Go job a distinct `cache-key-prefix`:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: cloudx-io/setup-go-cache@v1
        with:
          go-version: "1.26.1"
          cache-key-prefix: "test"
      - run: go test ./...

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: cloudx-io/setup-go-cache@v1
        with:
          go-version: "1.26.1"
          cache-key-prefix: "lint"
      - uses: golangci/golangci-lint-action@v9

  build-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: cloudx-io/setup-go-cache@v1
        with:
          go-version: "1.26.1"
          cache-key-prefix: "build-api"
      - run: go build -o bin/api ./cmd/api
```

### Inputs

| Name | Required | Default | Description |
|:--- |:--- |:--- |:--- |
| `go-version` | yes | | Go version to install. Passed through to `actions/setup-go`. |
| `cache-key-prefix` | yes | | Distinguishes this job's cache from other Go jobs in the same workflow. |
| `cache-dependency-path` | no | `**/go.sum` | Glob hashed into the cache key. |
| `max-staleness-hours` | no | `2` | Grace period, in hours, for unused build-cache files. Files untouched for longer than this interval are trimmed before save. |

### Outputs

| Name | Description |
|:--- |:--- |
| `cache-hit` | `true` when `actions/cache` restored an exact key match. In practice, always `false` because keys include run IDs. |

## Cache keys

Exact key (saved at the end of a successful job):

```text
go-cache-<os>-<arch>-<prefix>-<go-version>-<branch>-<hash(go.sum)>-<run_id>
```

`run_id` makes every successful save a new exact key, so two concurrent jobs cannot overwrite each other.

Keys will never match exactly because they include the `run_id`. Instead, every
blobs are restored from the GitHub Actions cache by prefix matching in this
priority order:

1. Same branch + same `go.sum`
2. Same branch, any `go.sum`
3. Default branch + same `go.sum`
4. Default branch, any `go.sum`

A failed job doesn't save its final cache state.

## Trimming

The nested `trim-gocache` action records the job start time, then in its **post** step (after your build/test, before `actions/cache` saves) deletes GOCACHE files outside the `max-staleness-hours` lookback window. The default is two hours, which accounts for Go's one-hour mtime-touch granularity. Set it to any non-negative whole number of hours.

## GitHub Actions Cache capacity

> [!NOTE]
> Last updated Sept. 28, 2026. This section summarizes disparate GitHub documentation and may be outdated.

`cloudx-io/setup-go` saves a new cache entry after every run. For many repositories, this will exhaust GitHub's default Actions Cache size limit (10 GB per repository[^default]) faster than `actions/setup-go`.

[^default]: https://docs.github.com/en/actions/reference/limits#storage-limits-for-all-github-hosted-runners

To alleviate this pressure, increase your GitHub Actions cache size limits.

This requires changing several settings:

1. [Increase the cache size eviction limit for your GitHub organization or enterprise.](https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization#configuring-github-actions-cache-settings-for-your-organization)

2. [Lift the budget for the Actions Cache Storage SKU](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#increasing-cache-size) to >$0 if you have GitHub metered-product spending budgets.

3. [Increase the cache size limit for your repository.](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#configuring-cache-settings-for-your-repository)

The lowest limit between these three controls the effective cache size.

> Repositories owned by users can configure up to 10 TB per repository. For repositories owned by organizations, the maximum configurable limit is determined by the organization's settings. For organizations owned by an enterprise, the maximum configurable limit is determined by the enterprise's settings.

GitHub estimates the following monthly costs:[^est-costs]

| Cache size | Monthly cost (if fully utilized) |
|:---------- | --------------------------------:|
| 10 GB      | $0.00 |
| 50 GB      | $2.80 |
| 200 GB     | $13.30 |
| 1000 GB    | $69.30 |

[^est-costs]: https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#increasing-cache-size

## License

[MIT](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
