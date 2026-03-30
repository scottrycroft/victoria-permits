// db.ts
import Dexie, { type Table } from "dexie";

import {
	type DocumentEntity,
	type PermitsEntityDB,
	type ViewedPermitInfoDB,
	type AddressLocation,
	type FavouritePermit
} from "./types/Permits";

export class PermitsDB extends Dexie {
	// 'lastSeenPermits' is added by dexie when declaring the stores()
	// We just tell the typing system this is the case
	lastSeenPermits!: Table<PermitsEntityDB>;

	todaysViewedPermits!: Table<ViewedPermitInfoDB>;

	clickedDocs!: Table<DocumentEntity>;

	addressLocations!: Table<AddressLocation>;

	favouritePermits!: Table<FavouritePermit>;

	constructor() {
		super("permits");
		this.version(20).stores({
			lastSeenPermits: "++id, [city+folderNumber], [dbVersion+city+folderNumber]", // Primary key and indexed props
			todaysViewedPermits: "[city+folderNumber], lastViewedDate",
			clickedDocs: null, // Delete old clickedDocs table
			clickedDocs2: "[city+permitID+docName]",
			addressLocations: "++id, &address",
			favouritePermits: "[city+folderNumber]"
		});
		this.version(21).stores({
			lastSeenPermits: "++id, [city+folderNumber], [dbVersion+city+folderNumber]",
			todaysViewedPermits: "[city+folderNumber], lastViewedDate",
			clickedDocs: "[city+permitID+docName]", // New clickedDocs with clickedDocs2 schema
			clickedDocs2: null, // Delete clickedDocs2 table (data migrated)
			addressLocations: "++id, &address",
			favouritePermits: "[city+folderNumber]"
		}).upgrade(async (tx) => {
			// Migrate data from clickedDocs2 to clickedDocs
			const clickedDocs2Data = await tx.table("clickedDocs2").toArray();
			const clickedDocsTable = tx.table("clickedDocs");
			for (const doc of clickedDocs2Data) {
				await clickedDocsTable.put(doc);
			}
		});
	}
}

export const db = new PermitsDB();
