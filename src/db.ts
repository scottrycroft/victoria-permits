// db.ts
import Dexie, { type Table } from "dexie";

import { type PermitsEntity } from "./types/Permits";

export class PermitsDB extends Dexie {
	// 'lastSeenPermits' is added by dexie when declaring the stores()
	// We just tell the typing system this is the case
	lastSeenPermits!: Table<PermitsEntity>;

	constructor() {
		super("permits");
		this.version(1).stores({
			lastSeenPermits: "++id, folderNumber" // Primary key and indexed props
		});
	}
}

export const db = new PermitsDB();
