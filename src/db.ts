// db.ts
import Dexie, { type Table } from "dexie";

import {
	type DocumentsEntity,
	type DocumentsEntity2,
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

	clickedDocs!: Table<DocumentsEntity>;

	clickedDocs2!: Table<DocumentsEntity2>;

	addressLocations!: Table<AddressLocation>;

	favouritePermits!: Table<FavouritePermit>;

	constructor() {
		super("permits");
		this.version(19).stores({
			lastSeenPermits: "++id, [city+folderNumber], [dbVersion+city+folderNumber]", // Primary key and indexed props
			todaysViewedPermits: "[city+folderNumber], lastViewedDate",
			clickedDocs: "[docName+docURL]",
			clickedDocs2: "[city+permitID+docName]",
			addressLocations: "++id, &address",
			favouritePermits: "[city+folderNumber]"
		});
	}
}

export const db = new PermitsDB();
