// This candidate always owns its origin and sharing database. Explicit provider
// credentials may be supplied through server environment variables only.
process.env.PORT='4187';
process.env.HOST='127.0.0.1';
process.env.SHARING_SQLITE_PATH='.local-data/companion/sharing.sqlite';
await import('./serve.mjs');
