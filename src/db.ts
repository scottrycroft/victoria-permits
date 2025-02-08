// db.ts
import Dexie, { type Table } from "dexie";

import {
	type DocumentsEntity,
	type PermitsEntityDB,
	type ViewedPermitInfoDB
} from "./types/Permits";

export class PermitsDB extends Dexie {
	// 'lastSeenPermits' is added by dexie when declaring the stores()
	// We just tell the typing system this is the case
	lastSeenPermits!: Table<PermitsEntityDB>;

	todaysViewedPermits!: Table<ViewedPermitInfoDB>;

	clickedDocs!: Table<DocumentsEntity>;

	constructor() {
		super("permits");
		this.version(7).stores({
			lastSeenPermits: "++id, [city+folderNumber], [dbVersion+city+folderNumber]", // Primary key and indexed props
			todaysViewedPermits: "[city+folderNumber], lastViewedDate",
			clickedDocs: "[docName+docURL]"
		});
	}
}

export const db = new PermitsDB();
