import { db } from "@/db";
import { loadGoogleMapsAPI } from "@/googleMapsLoader";

/**
 * Singleton class for managing Google Maps geocoding operations
 */
class GeocodingService {
	private static instance: GeocodingService;
	private geocoder: google.maps.Geocoder | null = null;

	private constructor() {
		// Private constructor to prevent direct instantiation
	}

	/**
	 * Get the singleton instance of GeocodingService
	 */
	public static getInstance(): GeocodingService {
		if (!GeocodingService.instance) {
			GeocodingService.instance = new GeocodingService();
		}
		return GeocodingService.instance;
	}

	/**
	 * Ensure Google Maps API is loaded before operations
	 * This is called automatically by public methods
	 * @returns Promise that resolves when the API is loaded
	 */
	private async ensureApiLoaded(): Promise<void> {
		return loadGoogleMapsAPI();
	}

	/**
		* Initialize the geocoder instance if not already created
		* @returns A Geocoder instance or null if Google Maps is not loaded
		*/
	private initializeGeocoder(): google.maps.Geocoder | null {
		if (!this.geocoder && window.google && window.google.maps) {
			this.geocoder = new google.maps.Geocoder();
		}
		return this.geocoder;
	}

	/**
	 * Get cached location for an address from IndexedDB
	 * @param address - The address string to look up
	 * @returns Promise resolving to cached coordinates or null if not found
	 */
	public async getCachedLocation(address: string): Promise<google.maps.LatLngLiteral | null> {
		try {
			const cachedLocation = await db.addressLocations.get({ address });
			if (cachedLocation) {
				return {
					lat: cachedLocation.lat,
					lng: cachedLocation.lng
				};
			}
			return null;
		} catch (error) {
			console.error(`Error getting cached location for: ${address}`, error);
			return null;
		}
	}

	/**
	 * Geocode an address with caching to IndexedDB
	 * Automatically loads the Google Maps API if not already loaded
	 * @param address - The address string to geocode
	 * @returns Promise resolving to LatLngLiteral or null if geocoding fails
	 */
	public async geocodeAddress(address: string): Promise<google.maps.LatLngLiteral | null> {
		// Ensure API is loaded
		await this.ensureApiLoaded();

		// Initialize geocoder if needed
		const geocoderInstance = this.initializeGeocoder();

		if (!geocoderInstance) {
			console.warn("Geocoder not available - Google Maps API may not be loaded");
			return null;
		}

		console.log(`Geocoding address: ${address}`);

		try {
			return new Promise((resolve) => {
				geocoderInstance.geocode(
					{
						address,
						componentRestrictions: {
							country: "CA",
							administrativeArea: "BC"
						}
					},
					async (
						results: google.maps.GeocoderResult[] | null,
						status: google.maps.GeocoderStatus
					) => {
						if (status === "OK" && results && results[0]) {
							const location = results[0].geometry.location;
							const coords = {
								lat: location.lat(),
								lng: location.lng()
							};

							// Cache the successful result
							try {
								await db.addressLocations.put({
									address,
									lat: coords.lat,
									lng: coords.lng
								});
								console.log(`💾 Cached geocoding result for: ${address}`, coords);
							} catch (cacheError) {
								console.warn(`❌ Failed to cache geocoding result for: ${address}`, cacheError);
							}

							resolve(coords);
						} else {
							console.warn(`❌ Geocoding failed for: ${address}, status: ${status}`);
							resolve(null);
						}
					}
				);
			});
		} catch (error) {
			console.error(`💥 Error in geocodeAddress for: ${address}`, error);
			return null;
		}
	}

	/**
	 * Geocode an address with automatic cache lookup
	 * First checks the cache, then geocodes if not found
	 * Automatically loads the Google Maps API if needed for geocoding
	 * @param address - The address string to geocode
	 * @returns Promise resolving to LatLngLiteral or null
	 */
	public async geocodeAddressWithCache(address: string): Promise<google.maps.LatLngLiteral | null> {
		// First check cache (doesn't require API)
		const cached = await this.getCachedLocation(address);
		if (cached) {
			console.log(`✅ Using cached location for: ${address}`, cached);
			return cached;
		}

		// If not cached, geocode it (this will auto-load API)
		return this.geocodeAddress(address);
	}
}

// Export the singleton instance
export const geocodingService = GeocodingService.getInstance();

// Also export the class for type checking if needed
export type { GeocodingService };
