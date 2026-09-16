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

## License

[MIT](LICENSE)
