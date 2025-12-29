// favourites.ts
import { db } from "./db";
import type { FavouritePermit, PermitsEntity } from "./types/Permits";

/**
 * Service class for managing favourite permits
 * Handles adding, removing, checking, and importing/exporting favourites
 */
export class FavouritesService {
	private favouritesSet: Set<string>;

	constructor() {
		this.favouritesSet = new Set<string>();
	}

	/**
	 * Initialize the favourites set from the database
	 */
	async initialize(): Promise<void> {
		const favourites = await db.favouritePermits.toArray();
		this.favouritesSet.clear();
		for (const favourite of favourites) {
			const key = this.getPermitKey(favourite.city, favourite.folderNumber);
			this.favouritesSet.add(key);
		}
	}

	/**
	 * Generate a unique key for a permit
	 */
	private getPermitKey(city: string, folderNumber: string): string {
		return `${city}-${folderNumber}`;
	}

	/**
	 * Check if a permit is favourited
	 */
	isFavourite(city: string, folderNumber: string): boolean {
		const key = this.getPermitKey(city, folderNumber);
		return this.favouritesSet.has(key);
	}

	/**
	 * Check if a permit is favourited (using PermitsEntity)
	 */
	isPermitFavourite(permit: PermitsEntity): boolean {
		return this.isFavourite(permit.city, permit.folderNumber);
	}

	/**
	 * Add a permit to favourites
	 */
	async addFavourite(city: string, folderNumber: string): Promise<void> {
		const key = this.getPermitKey(city, folderNumber);

		// Add to local set
		this.favouritesSet.add(key);

		// Add to database
		const favourite: FavouritePermit = {
			city,
			folderNumber
		};

		await db.favouritePermits.put(favourite);
	}

	/**
	 * Add a permit to favourites (using PermitsEntity)
	 */
	async addPermitFavourite(permit: PermitsEntity): Promise<void> {
		await this.addFavourite(permit.city, permit.folderNumber);
	}

	/**
	 * Remove a permit from favourites
	 */
	async removeFavourite(city: string, folderNumber: string): Promise<void> {
		const key = this.getPermitKey(city, folderNumber);

		// Remove from local set
		this.favouritesSet.delete(key);

		// Remove from database
		await db.favouritePermits.where({ city, folderNumber }).delete();
	}

	/**
	 * Remove a permit from favourites (using PermitsEntity)
	 */
	async removePermitFavourite(permit: PermitsEntity): Promise<void> {
		await this.removeFavourite(permit.city, permit.folderNumber);
	}

	/**
	 * Toggle favourite status for a permit
	 * Returns the new favourite status (true if now favourited, false if unfavourited)
	 */
	async toggleFavourite(city: string, folderNumber: string): Promise<boolean> {
		if (this.isFavourite(city, folderNumber)) {
			await this.removeFavourite(city, folderNumber);
			return false;
		} else {
			await this.addFavourite(city, folderNumber);
			return true;
		}
	}

	/**
	 * Toggle favourite status for a permit (using PermitsEntity)
	 * Returns the new favourite status (true if now favourited, false if unfavourited)
	 */
	async togglePermitFavourite(permit: PermitsEntity): Promise<boolean> {
		return await this.toggleFavourite(permit.city, permit.folderNumber);
	}

	/**
	 * Get all favourites from the database
	 */
	async getAllFavourites(): Promise<FavouritePermit[]> {
		return await db.favouritePermits.toArray();
	}

	/**
	 * Get count of favourites
	 */
	getFavouritesCount(): number {
		return this.favouritesSet.size;
	}

	/**
	 * Export favourites to JSON format
	 * Returns a sorted array of favourites
	 */
	async exportFavourites(): Promise<FavouritePermit[]> {
		const favourites = await this.getAllFavourites();
		// Sort by city, then by folderNumber for stable output
		favourites.sort((a, b) => {
			const cityCompare = a.city.localeCompare(b.city);
			if (cityCompare !== 0) return cityCompare;
			return a.folderNumber.localeCompare(b.folderNumber);
		});
		return favourites;
	}

	/**
	 * Import favourites from JSON data
	 * Validates the data structure before importing
	 * Returns the number of favourites imported
	 */
	async importFavourites(data: FavouritePermit[]): Promise<number> {
		// Validate the data structure
		if (!Array.isArray(data)) {
			throw new Error("JSON file must contain an array of favourites");
		}

		// Validate each item has the required fields
		for (const item of data) {
			if (!item.city || !item.folderNumber) {
				throw new Error("Each favourite must have 'city' and 'folderNumber' fields");
			}
		}

		// Add favourites to the database (bulkPut will add or update)
		await db.favouritePermits.bulkPut(data);

		// Reinitialize the favourites set
		await this.initialize();

		return data.length;
	}

	/**
	 * Clear all favourites
	 */
	async clearAllFavourites(): Promise<void> {
		await db.favouritePermits.clear();
		this.favouritesSet.clear();
	}
}

// Export a singleton instance
export const favouritesService = new FavouritesService();
