//LOWDB setup
import { join, dirname } from "path";
import * as lowdb from "lowdb";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, "db.json");
const adapter = new lowdb.JSONFile(file);
export const db = new lowdb.Low(adapter);
await db.read();
db.data = db.data || { days: [] };
db.write();
//# sourceMappingURL=lowdb-config.js.map