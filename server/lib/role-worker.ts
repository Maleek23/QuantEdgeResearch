/**
 * Imported FIRST by server/worker.ts: dist/worker.js is the worker unless ROLE
 * says otherwise explicitly. ESM evaluates imports in order, so modules that
 * read the role at load time (self-learning auto-start) see it.
 */
if (!process.env.ROLE) process.env.ROLE = 'worker';
export {};
