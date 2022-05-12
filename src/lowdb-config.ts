//LOWDB setup
import { join, dirname } from "path";
import * as lowdb from "lowdb";
import { fileURLToPath } from "url";
import { FrameRecord } from ".";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use JSON file for storage
//Setting up lowd

type Data = {
  days: { date: string; frames: FrameRecord[] }[];
};

const file = join(__dirname, "db.json");
const adapter = new lowdb.JSONFile<Data>(file);
export const db = new lowdb.Low(adapter);

await db.read();

db.data = db.data || { days: [] };
db.write();
