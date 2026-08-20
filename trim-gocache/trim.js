// Trim GOCACHE to this run's working set before actions/cache saves it.
//
// Go touches an entry's mtime whenever it's used (that's how its own 5-day
// age trim works), so after the job's build/test steps every entry this run
// read or wrote has mtime >= job start. Everything older went unused this
// run and is safe to drop. This keeps the saved cache exactly the size of
// the working set with no arbitrary byte budget to recalibrate as the repo
// grows — and it never evicts hot entries, which a fixed budget below the
// working set does (forcing arbitrary recompiles on the next run).
//
// The configurable cutoff slack defaults to 2h. Go skips the mtime touch
// when the file was already touched within the last hour (mtimeInterval), so
// entries restored from a cache saved very recently may retain pre-job mtimes
// even though they were used. Over-keeping slightly is harmless;
// under-keeping forces recompiles.
//
// Failed jobs can't poison the cache: actions/cache's save step is gated on
// post-if: success(), so a partial run's trimmed disk state is simply never
// uploaded.
//
// This runs as the composite action's post-hook in reverse declaration
// order — after the consumer workflow's build/lint/test steps populate
// GOCACHE, before actions/cache's post-save tars and uploads it.

const fs = require('fs');
const path = require('path');

// Go's gcTrimLimit: entries unused for this long are dead even to Go's own
// GC. Fallback cutoff if the job start time is somehow missing.
const FALLBACK_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_STALENESS_HOURS = 2;
const HOUR_MS = 60 * 60 * 1000;
const MAX_STALENESS_HOURS = Math.floor(Number.MAX_SAFE_INTEGER / HOUR_MS);

const dir = process.env.INPUT_GOCACHE;

if (!dir || !fs.existsSync(dir)) {
  console.log(`GOCACHE ${dir || '(unset)'} does not exist; nothing to trim.`);
  process.exit(0);
}

const startMs = parseInt(process.env.STATE_startMs || '', 10);
const rawMaxStalenessHours = process.env.STATE_maxStalenessHours ??
  process.env.INPUT_MAX_STALENESS_HOURS ??
  process.env['INPUT_MAX-STALENESS-HOURS'] ??
  String(DEFAULT_MAX_STALENESS_HOURS);
const maxStalenessHours = Number(rawMaxStalenessHours);
if (!/^\d+$/.test(rawMaxStalenessHours) ||
    !Number.isSafeInteger(maxStalenessHours) ||
    maxStalenessHours > MAX_STALENESS_HOURS) {
  throw new Error('max-staleness-hours must be a non-negative integer number of hours that fits in a JavaScript timestamp');
}
const cutoff = Number.isFinite(startMs)
  ? startMs - maxStalenessHours * HOUR_MS
  : Date.now() - FALLBACK_AGE_MS;
if (!Number.isFinite(startMs)) {
  console.warn('job start time missing from state; falling back to age-based cutoff');
}

let kept = 0, keptBytes = 0, removed = 0, removedBytes = 0;
(function walk(d) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) { walk(p); continue; }
    if (!ent.isFile()) continue;
    let s;
    try { s = fs.statSync(p); }
    catch { continue; /* races are fine */ }
    if (s.mtimeMs >= cutoff) { kept++; keptBytes += s.size; continue; }
    try { fs.unlinkSync(p); removed++; removedBytes += s.size; }
    catch (e) { console.warn(`unlink ${p}: ${e.message}`); }
  }
})(dir);

const mb = b => Math.round(b / 1024 / 1024);
console.log(
  `GOCACHE trim: cutoff=${new Date(cutoff).toISOString()}, ` +
  `kept ${kept} files (${mb(keptBytes)}MB), ` +
  `removed ${removed} files (${mb(removedBytes)}MB)`
);
