// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Workaround for "DataCloneError: Data cannot be cloned, out of memory"
// during bundling on this Node version — Metro's worker_threads pool hits a
// structured-clone serialization bug transferring transform results back to
// the main process. Running transforms in-band (no worker threads) avoids
// the postMessage/structuredClone step entirely at the cost of bundling
// speed. Safe to remove once Node/Metro's worker_threads handling is fixed.
config.maxWorkers = 1;

module.exports = config;
