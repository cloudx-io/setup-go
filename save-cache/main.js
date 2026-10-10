const fs = require('node:fs');

// Freeze restore's resolved key and paths for the post-job save.
fs.appendFileSync(
  process.env.GITHUB_STATE,
  `cacheInputs=${JSON.stringify({
    path: process.env.INPUT_PATH,
    key: process.env.INPUT_KEY,
  })}\n`,
);
