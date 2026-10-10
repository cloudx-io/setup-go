const inputs = JSON.parse(process.env.STATE_cacheInputs);
process.env.INPUT_PATH = inputs.path;
process.env.INPUT_KEY = inputs.key;

// Use the upstream save-only implementation in this action's post phase.
require('./dist/index.js');
