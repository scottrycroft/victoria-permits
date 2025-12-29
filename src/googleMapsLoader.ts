const API_KEY = "AIzaSyB-AAgFz8X7o_N5vmiLU1MoKPUVa6_0NPA";

let isApiLoaded = false;
let apiLoadPromise: Promise<void> | null = null;

/**
 * Load Google Maps JavaScript API with callback
 * This function ensures the API is only loaded once, even if called multiple times
 * @returns Promise that resolves when the API is loaded
 */
export async function loadGoogleMapsAPI(): Promise<void> {
	// If already loaded, return immediately
	if (isApiLoaded && window.google && window.google.maps) {
		console.log("Google Maps API already loaded");
		return Promise.resolve();
	}

	// If currently loading, return the existing promise
	if (apiLoadPromise) {
		return apiLoadPromise;
	}

	// Start loading
	apiLoadPromise = new Promise((resolve, reject) => {
		if (window.google && window.google.maps) {
			console.log("Google Maps API already loaded");
			isApiLoaded = true;
			resolve();
			return;
		}

		// Create callback function name
		const callbackName = "initGoogleMapsCallback_" + Date.now();

		// Create global callback
		(window as any)[callbackName] = () => {
			delete (window as any)[callbackName];
			isApiLoaded = true;
			apiLoadPromise = null;
			resolve();
		};

		const script = document.createElement("script");
		const apiUrl = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=drawing&callback=${callbackName}`;
		console.log("Loading Google Maps API with URL:", apiUrl);
		script.src = apiUrl;
		script.async = true;
		script.defer = true;

		script.onerror = (error) => {
			console.error("Failed to load Google Maps script:", error);
			delete (window as any)[callbackName];
			apiLoadPromise = null;
			reject(new Error("Failed to load Google Maps API"));
		};

		document.head.appendChild(script);
	});

	return apiLoadPromise;
}

/**
 * Check if the Google Maps API is loaded
 * @returns true if the API is loaded and available
 */
export function isGoogleMapsLoaded(): boolean {
	return isApiLoaded && window.google && window.google.maps !== undefined;
}
