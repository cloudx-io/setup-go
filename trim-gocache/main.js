// Record the job start time and configured retention window for trim.js (the
// post step). Entries used by this run will have mtimes at or after this
// instant, modulo Go's touch granularity — see the cutoff slack in trim.js.
const fs = require('fs');

const DEFAULT_MAX_STALENESS_HOURS = 2;
const HOUR_MS = 60 * 60 * 1000;
const MAX_STALENESS_HOURS = Math.floor(Number.MAX_SAFE_INTEGER / HOUR_MS);
const rawMaxStalenessHours = process.env.INPUT_MAX_STALENESS_HOURS ??
  process.env['INPUT_MAX-STALENESS-HOURS'] ??
  String(DEFAULT_MAX_STALENESS_HOURS);
const maxStalenessHours = Number(rawMaxStalenessHours);

if (!/^\d+$/.test(rawMaxStalenessHours) ||
    !Number.isSafeInteger(maxStalenessHours) ||
    maxStalenessHours > MAX_STALENESS_HOURS) {
  throw new Error('max-staleness-hours must be a non-negative integer number of hours that fits in a JavaScript timestamp');
}

fs.appendFileSync(
  process.env.GITHUB_STATE,
  `startMs=${Date.now()}\nmaxStalenessHours=${maxStalenessHours}\n`,
);
