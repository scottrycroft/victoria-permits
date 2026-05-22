// permitFlagService.ts
import type { Table } from "dexie";
import type { PermitsEntity } from "./types/Permits";

/** Shape of a row in a permit-flag table (minor / major). */
interface PermitFlagRow {
	city: string;
	folderNumber: string;
}

/**
 * Generic service for managing a boolean permit flag stored in IndexedDB.
 * On initialization, applies DB overrides directly to the in-memory permit objects
 * so that `permit.minor` / `permit.major` reflect user-set values.
 * On toggle, mutates the permit object and persists to the DB.
 *
 * Tracks which permits were user-overridden so the UI can prevent unsetting
 * flags that originate from the data source.
 *
 * Reused by both minorPermitsService and majorPermitsService.
 */
export class PermitFlagService {
	private table: Table<PermitFlagRow>;
	private field: "minor" | "major";
	/** Keys of permits whose flag was set by the user (exists in the DB). */
	private userOverrides = new Set<string>();

	constructor(table: Table<PermitFlagRow>, field: "minor" | "major") {
		this.table = table;
		this.field = field;
	}

	private getKey(city: string, folderNumber: string): string {
		return `${city}-${folderNumber}`;
	}

	/**
	 * Load overrides from the database and apply them to the in-memory permit objects.
	 * @param permitMap Map of "city-folderNumber" → PermitsEntity.
	 */
	async initialize(permitMap: Map<string, PermitsEntity>): Promise<void> {
		const rows = await this.table.toArray();
		this.userOverrides.clear();
		for (const row of rows) {
			const key = this.getKey(row.city, row.folderNumber);
			this.userOverrides.add(key);
			const permit = permitMap.get(key);
			if (permit) {
				permit[this.field] = true;
			}
		}
	}

	/**
	 * Whether this permit's flag was set by the user (as opposed to the data source).
	 * Use this to decide whether the "Unset" action should be available.
	 */
	isUserOverride(permit: PermitsEntity): boolean {
		return this.userOverrides.has(this.getKey(permit.city, permit.folderNumber));
	}

	/**
	 * Toggle the flag on a permit. Mutates the permit object directly and persists to the DB.
	 * Only allows unsetting if the flag was user-set (not from the data source).
	 * Returns the new status (true = now set, false = now unset).
	 */
	async togglePermit(permit: PermitsEntity): Promise<boolean> {
		const key = this.getKey(permit.city, permit.folderNumber);
		if (permit[this.field] && this.userOverrides.has(key)) {
			// Unset — only allowed for user overrides
			permit[this.field] = false;
			this.userOverrides.delete(key);
			await this.table.where({ city: permit.city, folderNumber: permit.folderNumber }).delete();
			return false;
		} else if (!permit[this.field]) {
			// Set
			permit[this.field] = true;
			this.userOverrides.add(key);
			await this.table.put({ city: permit.city, folderNumber: permit.folderNumber });
			return true;
		}
		// Flag is set from data source — no-op
		return true;
	}

	/** Export flagged permits as a sorted array. */
	async exportAll(): Promise<PermitFlagRow[]> {
		const rows = await this.table.toArray();
		rows.sort((a, b) => {
			const cityCompare = a.city.localeCompare(b.city);
			if (cityCompare !== 0) return cityCompare;
			return a.folderNumber.localeCompare(b.folderNumber);
		});
		return rows;
	}
}
