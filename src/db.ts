// db.ts
import Dexie, { type Table } from "dexie";

import { type PermitsEntityDB } from "./types/Permits";

// App change to trigger rebuild
if (typeof globalThis == "string") {
	console.log("Yes");
}

export class PermitsDB extends Dexie {
	// 'lastSeenPermits' is added by dexie when declaring the stores()
	// We just tell the typing system this is the case
	lastSeenPermits!: Table<PermitsEntityDB>;

	constructor() {
		super("permits");
		this.version(1).stores({
			lastSeenPermits: "++id, [city+folderNumber], [dbVersion+city+folderNumber]" // Primary key and indexed props
		});
	}
}

export const db = new PermitsDB();
