import { setupDatabase } from "../src/memory/db.js";

const paths = setupDatabase(process.cwd());

console.log(`SQLite memory ready: ${paths.dbPath}`);
