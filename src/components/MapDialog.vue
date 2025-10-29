<script setup lang="ts">
import { db } from "@/db";
import type { PermitsEntity } from "@/types/Permits";
import { getFormattedDate } from "@/utils";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { useToast } from "primevue/usetoast";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
	visible: boolean;
	permits: PermitsEntity[];
}>();

const emit = defineEmits<{
	"update:visible": [value: boolean];
	"permit-folder-clicked": [city: string, permitFolderNumber: string];
}>();

const toast = useToast();
const mapContainer = ref<HTMLElement | null>(null);
const map = ref<google.maps.Map | null>(null);
const markers = ref<google.maps.Marker[]>([]);
const geocoder = ref<google.maps.Geocoder | null>(null);
const isMapLoaded = ref(false);
const isLoadingMarkers = ref(false);
const currentInfoWindow = ref<google.maps.InfoWindow | null>(null);
const currentPermitOffset = ref(0);
const permitsPerBatch = 100;

const API_KEY = "AIzaSyB-AAgFz8X7o_N5vmiLU1MoKPUVa6_0NPA";

// Rectangle selection state
const isSelectionMode = ref(false);
const currentRectangle = ref<google.maps.Rectangle | null>(null);
const selectedMarkers = ref<Set<google.maps.Marker>>(new Set());
const drawingManager = ref<google.maps.drawing.DrawingManager | null>(null);

// Cached location mode state
const isCachedLocationMode = ref(false);

const dialogVisible = computed({
	get: () => props.visible,
	set: (value: boolean) => emit("update:visible", value)
});

// Filter for only active permits and sort by most recently updated
const activePermits = computed(() => {
	const inactiveStatuses = [
		"Closed",
		"Complete",
		"Completed",
		"Cancelled",
		"Canceled",
		"Withdrawn",
		"Expired",
		"Denied",
		"Rejected",
		"Finalized",
		"Final"
	];

	const filtered = props.permits.filter(
		(permit) =>
			permit.status &&
			!inactiveStatuses.some((status) => permit.status.toLowerCase().includes(status.toLowerCase()))
	);

	// Sort by lastUpdated date (most recent first)
	return filtered.sort((a, b) => {
		const dateA = a.lastUpdated || 0;
		const dateB = b.lastUpdated || 0;
		return dateB - dateA; // Most recent first
	});
});

// Load Google Maps JavaScript API with callback
const loadGoogleMapsAPI = (): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (window.google && window.google.maps) {
			console.log("Google Maps API already loaded");
			resolve();
			return;
		}

		// Create callback function name
		const callbackName = "initGoogleMapsCallback_" + Date.now();

		// Create global callback
		(window as any)[callbackName] = () => {

			delete (window as any)[callbackName];
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
			reject(new Error("Failed to load Google Maps API"));
		};

		document.head.appendChild(script);
	});
};

// Handle permit folder click from InfoWindow
const handlePermitFolderClick = (city: string, folderNumber: string) => {
	emit("permit-folder-clicked", city, folderNumber);
};

// Set up global handler for InfoWindow clicks
const setupGlobalHandler = () => {
	(window as any).handlePermitFolderClick = handlePermitFolderClick;
};

// Initialize drawing manager for rectangle selection
const initializeDrawingManager = () => {
	if (!map.value) return;

	drawingManager.value = new google.maps.drawing.DrawingManager({
		drawingMode: null, // Start disabled
		drawingControl: false, // We'll use custom controls
		rectangleOptions: {
			fillColor: '#3366ff',
			fillOpacity: 0.2,
			strokeWeight: 2,
			strokeColor: '#3366ff',
			clickable: false,
			editable: true,
			zIndex: 1
		}
	});

	drawingManager.value.setMap(map.value);

	// Listen for rectangle completion
	google.maps.event.addListener(drawingManager.value, 'rectanglecomplete', (rectangle: google.maps.Rectangle) => {
		
		// Clear previous rectangle if exists
		if (currentRectangle.value) {
			currentRectangle.value.setMap(null);
		}
		
		currentRectangle.value = rectangle;
		
		// Select markers within the rectangle
		selectMarkersInRectangle(rectangle);
		
		// Exit drawing mode after rectangle is drawn
		drawingManager.value?.setDrawingMode(null);
		isSelectionMode.value = false;
		map.value?.setOptions({ draggableCursor: null });
	});
};

// Check if marker is within rectangle bounds
const isMarkerInRectangle = (marker: google.maps.Marker, rectangle: google.maps.Rectangle): boolean => {
	const markerPos = marker.getPosition();
	const bounds = rectangle.getBounds();
	return bounds?.contains(markerPos!) || false;
};

// Select all markers within the rectangle
const selectMarkersInRectangle = (rectangle: google.maps.Rectangle) => {
	selectedMarkers.value.clear();
	
	markers.value.forEach(marker => {
		if (isMarkerInRectangle(marker, rectangle)) {
			selectedMarkers.value.add(marker);
			highlightMarker(marker, true);
		} else {
			highlightMarker(marker, false);
		}
	});
};

// Highlight marker based on selection state
const highlightMarker = (marker: google.maps.Marker, selected: boolean) => {
	if (selected) {
		// Create a highlighted marker icon (larger and different color)
		marker.setIcon({
			path: google.maps.SymbolPath.CIRCLE,
			scale: 12,
			fillColor: '#ff4444',
			fillOpacity: 1,
			strokeColor: '#ffffff',
			strokeWeight: 2
		});
	} else {
		// Reset to default marker
		marker.setIcon(null); // This will use the default marker
	}
};

// Toggle rectangle selection mode
const toggleSelectionMode = () => {
	if (!drawingManager.value) return;
	
	isSelectionMode.value = !isSelectionMode.value;
	
	if (isSelectionMode.value) {
		// Enter selection mode
		drawingManager.value.setDrawingMode(google.maps.drawing.OverlayType.RECTANGLE);
		map.value?.setOptions({ draggableCursor: 'crosshair' });
	} else {
		// Exit selection mode
		drawingManager.value.setDrawingMode(null);
		map.value?.setOptions({ draggableCursor: null });
		clearSelection();
	}
};

// Clear current selection
const clearSelection = () => {
	// Clear rectangle
	if (currentRectangle.value) {
		currentRectangle.value.setMap(null);
		currentRectangle.value = null;
	}
	
	// Reset all markers to default appearance
	markers.value.forEach(marker => {
		highlightMarker(marker, false);
	});
	
	selectedMarkers.value.clear();
	isSelectionMode.value = false;
	
	if (drawingManager.value) {
		drawingManager.value.setDrawingMode(null);
	}
	
	map.value?.setOptions({ draggableCursor: null });
};

// Toggle cached location mode
const toggleCachedLocationMode = async () => {
	isCachedLocationMode.value = !isCachedLocationMode.value;
	
	if (isCachedLocationMode.value) {
		await addCachedLocationMarkers();
	} else {
		await addPermitMarkers();
	}
};

// Computed property for selection count
const selectedMarkersCount = computed(() => selectedMarkers.value.size);

// Computed properties for permit loading status
const currentlyLoadedCount = computed(() => Math.min(currentPermitOffset.value + permitsPerBatch, activePermits.value.length));
const totalPermitsCount = computed(() => activePermits.value.length);
const hasMorePermits = computed(() => currentPermitOffset.value < activePermits.value.length);

// Initialize the interactive map
const initializeMap = async () => {
	if (!mapContainer.value || !props.visible) return;

	try {
		console.log("Loading Google Maps API...");
		await loadGoogleMapsAPI();

		// Default center on Victoria, BC
		const defaultCenter = { lat: 48.4284, lng: -123.3656 };

		map.value = new google.maps.Map(mapContainer.value, {
			zoom: 11,
			center: defaultCenter,
			mapTypeId: google.maps.MapTypeId.ROADMAP,
			zoomControl: true,
			streetViewControl: true,
			fullscreenControl: true
		});

		geocoder.value = new google.maps.Geocoder();
		isMapLoaded.value = true;

		console.log("Map initialized successfully");

		// Set up global handler for InfoWindow clicks
		setupGlobalHandler();

		// Initialize drawing manager for rectangle selection
		initializeDrawingManager();

		// Add permit markers
		await addPermitMarkers();
	} catch (error) {
		console.error("Failed to initialize map:", error);
		toast.add({
			severity: "error",
			summary: "Map Error",
			detail: "Failed to load interactive Google Maps. Please check your connection."
		});
	}
};

// Close the current info window if open
const closeCurrentInfoWindow = () => {
	if (currentInfoWindow.value) {
		currentInfoWindow.value.close();
		currentInfoWindow.value = null;
	}
};

// Clear and destroy the map completely
const clearMap = () => {
	// Clear selection state
	clearSelection();

	// Clear all markers first
	clearMarkers();

	// Close any open info window
	closeCurrentInfoWindow();

	// Clear drawing manager
	if (drawingManager.value) {
		drawingManager.value.setMap(null);
		drawingManager.value = null;
	}

	// Clear map reference
	if (map.value) {
		// Remove all event listeners and clear the map
		google.maps.event.clearInstanceListeners(map.value);
		map.value = null;
	}

	// Reset all map-related state
	geocoder.value = null;
	isMapLoaded.value = false;
	isLoadingMarkers.value = false;
	currentPermitOffset.value = 0; // Reset permit offset

	// Clear the map container content to ensure clean slate
	if (mapContainer.value) {
		mapContainer.value.innerHTML = "";
	}
};

// Clear existing markers
const clearMarkers = () => {
	markers.value.forEach((marker: google.maps.Marker) => {
		marker.setMap(null);
	});
	markers.value = [];

	// Also close and clear any open info window
	closeCurrentInfoWindow();
};

const getPermitAddressCacheKey = (permit: PermitsEntity): string => {
	return `${permit.primaryStreetName}, ${permit.city}, BC, Canada`;
};

// Add interactive markers for permit addresses with hover tooltips (original logic)
const addPermitMarkers = async (clearExisting = true) => {
	if (!map.value || !geocoder.value) return;

	isLoadingMarkers.value = true;
	if (clearExisting) {
		clearMarkers();
		currentPermitOffset.value = 0;
	}

	const bounds = new google.maps.LatLngBounds();
	let hasValidLocations = false;

	// Process permits in batches to avoid rate limits
	const batchSize = 5;
	const startIndex = clearExisting ? 0 : currentPermitOffset.value;
	const endIndex = Math.min(startIndex + permitsPerBatch, activePermits.value.length);

	const cacheMisses = [];
	const permitsToGeocode = activePermits.value.slice(startIndex, endIndex);
	for (const permit of permitsToGeocode) {
		// First check if we have this address cached
		const address = getPermitAddressCacheKey(permit);
		const cachedLocation = await db.addressLocations.get({ address });
		if (cachedLocation) {

			await addAddressMarker(
				permit,
				{
					lat: cachedLocation.lat,
					lng: cachedLocation.lng
				},
				bounds,
				markers.value
			);
			hasValidLocations = true;
		} else {
			cacheMisses.push(permit);
		}
	}

	for (let i = 0; i < cacheMisses.length; i += batchSize) {
		const batch = cacheMisses.slice(i, i + batchSize);

		await Promise.all(
			batch.map(async (permit) => {
				try {
					const address = getPermitAddressCacheKey(permit);

					const result = await geocodeAddress(address);
					if (result) {
						await addAddressMarker(permit, result, bounds, markers.value);
						hasValidLocations = true;
					}
				} catch (error) {
					console.warn(
						`Failed to geocode address: ${permit.primaryStreetName}, ${permit.city}`,
						error
					);
				}
			})
		);

		// Small delay between batches to respect rate limits
		if (i + batchSize < cacheMisses.length) {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}

	// Update the current offset
	if (!clearExisting) {
		currentPermitOffset.value = endIndex;
	}

	// Fit map to show all markers (only if this is the initial load or we have new valid locations)
	if (hasValidLocations && map.value && (clearExisting || markers.value.length === 1)) {
		// Extend bounds to include existing markers if not clearing
		if (!clearExisting) {
			markers.value.forEach(marker => {
				const position = marker.getPosition();
				if (position) {
					bounds.extend(position);
				}
			});
		}
		
		map.value.fitBounds(bounds);

		// Ensure reasonable zoom level
		const listener = google.maps.event.addListener(map.value, "bounds_changed", () => {
			if (map.value!.getZoom()! > 16) {
				map.value!.setZoom(16);
			}
			google.maps.event.removeListener(listener);
		});
	}

	isLoadingMarkers.value = false;
};

// Load next batch of permits
const loadNextPermits = async () => {
	if (currentPermitOffset.value >= activePermits.value.length) {
		return; // No more permits to load
	}
	
	await addPermitMarkers(false); // Don't clear existing markers
};

// Add interactive markers for cached address locations only (selection mode)
const addCachedLocationMarkers = async () => {
	if (!map.value) return;

	isLoadingMarkers.value = true;
	clearMarkers();

	const bounds = new google.maps.LatLngBounds();
	let hasValidLocations = false;

	try {
		// Get all cached address locations from the database
		const cachedLocations = await db.addressLocations.toArray();
		console.log(`Found ${cachedLocations.length} cached address locations for selection mode`);

		// For each cached location, find matching permits
		for (const cachedLocation of cachedLocations) {
			// Find permits that match this cached address
			const matchingPermits = activePermits.value.filter(permit => {
				const permitAddress = getPermitAddressCacheKey(permit);
				return permitAddress === cachedLocation.address;
			});

			// Create markers for each matching permit at this cached location
			for (const permit of matchingPermits) {
				

				await addAddressMarker(
					permit,
					{
						lat: cachedLocation.lat,
						lng: cachedLocation.lng
					},
					bounds,
					markers.value
				);
				hasValidLocations = true;
			}
		}

		// Fit map to show all markers
		if (hasValidLocations && map.value) {
			map.value.fitBounds(bounds);

			// Ensure reasonable zoom level
			const listener = google.maps.event.addListener(map.value, "bounds_changed", () => {
				if (map.value!.getZoom()! > 16) {
					map.value!.setZoom(16);
				}
				google.maps.event.removeListener(listener);
			});
		}
	} catch (error) {
		console.error("Failed to load cached address locations:", error);
		toast.add({
			severity: "error",
			summary: "Map Error",
			detail: "Failed to load cached address locations."
		});
	}

	isLoadingMarkers.value = false;
};

const addAddressMarker = async (
	permit: PermitsEntity,
	latLong: google.maps.LatLngLiteral,
	bounds: google.maps.LatLngBounds,
	markers: google.maps.Marker[]
): Promise<void> => {

	let marker: google.maps.Marker;

	try {
		// Use classic Google Maps Marker instead of AdvancedMarkerElement
		marker = new google.maps.Marker({
			position: latLong,
			map: map.value,
			title: `${permit.folderNumber}: ${permit.primaryStreetName}`
		});
	} catch (error) {
		console.error("Failed to create classic Marker for permit", permit.folderNumber, ":", error);
		throw error;
	}

	// Add click event for more details using classic Marker API
	marker.addListener("click", () => {
		// Close any previously open info window
		closeCurrentInfoWindow();

		const lastUpdatedStr = permit.lastUpdated ? getFormattedDate(permit.lastUpdated) : "N/A";

		// Show detailed info window
		const detailWindow = new google.maps.InfoWindow({
			content: `
				<div style="min-width: 350px;">
					<h4 style="margin: 0 0 8px 0; color: #1a73e8; cursor: pointer; text-decoration: underline;"
						class="permitFolderNumber"
						onclick="window.handlePermitFolderClick('${permit.city}', '${permit.folderNumber}')">
						${permit.folderNumber}
					</h4>
					<div style="margin-bottom: 6px;">
						<strong>Address:</strong> ${permit.primaryStreetName}
					</div>
					<div style="margin-bottom: 6px;">
						<strong>City:</strong> ${permit.city}
					</div>
					<div style="margin-bottom: 6px;">
						<strong>Application Type:</strong> ${permit.applicationType}
					</div>
					<div style="margin-bottom: 6px;">
						<strong>Last Updated:</strong> ${lastUpdatedStr}
					</div>
					<div style="margin-bottom: 6px;">
						<strong>Purpose:</strong> ${permit.purpose}
					</div>
				</div>
			`,
			pixelOffset: new google.maps.Size(0, -30)
		});

		// Store reference to the current info window
		currentInfoWindow.value = detailWindow;

		detailWindow.open(map.value, marker);
	});

	markers.push(marker);
	bounds.extend(latLong);
};

// Geocode an address with caching
const geocodeAddress = async (address: string): Promise<google.maps.LatLngLiteral | null> => {
	if (!geocoder.value) {
		console.log("Geocoder not available");
		return null;
	}

	console.log(`Geocoding address: ${address}`);

	try {
		return new Promise((resolve) => {
			geocoder.value!.geocode(
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
};

// View all active locations
const viewAllLocations = () => {
	const searchQuery = activePermits.value
		.slice(0, 20)
		.map((permit) => `"${permit.primaryStreetName}, ${permit.city}"`)
		.join(" OR ");

	const url = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
	window.open(url, "_blank");
};

// Watch for dialog visibility changes
watch(
	() => props.visible,
	async (newVisible) => {
		if (newVisible) {
			// Dialog opening - always create fresh map
			console.log("Dialog opening - initializing fresh map");
			await nextTick();
			await initializeMap();
		} else {
			// Dialog closing - completely clear the map for fresh start next time
			console.log("Dialog closing - clearing map completely");
			clearMap();
		}
	}
);

// Watch for permit changes
watch(
	() => activePermits.value,
	async () => {
		if (isMapLoaded.value && props.visible) {
			await addPermitMarkers();
		}
	},
	{ deep: true }
);

// Handle keyboard events for selection mode
const handleKeyDown = (event: KeyboardEvent) => {
	if (!props.visible) return;
	
	if (event.key === 'Escape') {
		event.preventDefault();
		if (isSelectionMode.value) {
			toggleSelectionMode();
		}
	} else if (event.key === 'Delete' || event.key === 'Backspace') {
		event.preventDefault();
		if (selectedMarkers.value.size > 0) {
			clearSelection();
		}
	}
};

onMounted(() => {
	if (props.visible) {
		nextTick(() => {
			initializeMap();
		});
	}
	
	// Add keyboard event listeners
	document.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
	clearMarkers();
	
	// Remove keyboard event listeners
	document.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
	<Dialog
		v-model:visible="dialogVisible"
		:dismissableMask="true"
		:style="{ width: '95vw', height: '90vh' }"
		header="Interactive Map"
		:modal="true"
		class="map-dialog"
	>
		<template #header>
			<div class="flex align-items-center justify-content-between w-full">
				<div class="flex align-items-center gap-3">
					<h3 class="m-0">Active Permit Locations - Interactive Map</h3>
					<span class="text-sm text-500"
						>({{ markers?.length || 0 }} showing of {{ currentlyLoadedCount }} loaded / {{ totalPermitsCount }} total)</span
					>
					<div v-if="isLoadingMarkers" class="flex align-items-center gap-2 ml-3">
						<i class="pi pi-spin pi-spinner text-sm"></i>
						<span class="text-sm">Loading markers...</span>
					</div>
				</div>
				
				<div class="flex align-items-center gap-2">
					<!-- Load Next 100 button -->
					<Button
						v-if="hasMorePermits && !isCachedLocationMode"
						@click="loadNextPermits"
						:disabled="isLoadingMarkers"
						icon="pi pi-plus"
						label="Load Next 100"
						size="small"
						severity="info"
						outlined
						:title="`Load next ${Math.min(permitsPerBatch, totalPermitsCount - currentlyLoadedCount)} permits`"
					/>
					
					<!-- Selection status -->
					<div v-if="selectedMarkersCount > 0" class="flex align-items-center gap-2">
						<span class="text-sm font-semibold text-primary">
							{{ selectedMarkersCount }} selected
						</span>
						<Button
							@click="clearSelection"
							icon="pi pi-times"
							size="small"
							severity="secondary"
							outlined
							title="Clear selection (Delete)"
						/>
					</div>
					
					<!-- Cached location mode toggle -->
					<Button
						@click="toggleCachedLocationMode"
						:icon="isCachedLocationMode ? 'pi pi-database' : 'pi pi-map-marker'"
						:label="isCachedLocationMode ? 'Show All' : 'Cached Only'"
						size="small"
						:severity="isCachedLocationMode ? 'success' : 'secondary'"
						:outlined="!isCachedLocationMode"
						:title="isCachedLocationMode ? 'Show all permits (with geocoding)' : 'Show only cached locations'"
					/>
					
					<!-- Selection mode toggle -->
					<Button
						@click="toggleSelectionMode"
						:icon="isSelectionMode ? 'pi pi-times' : 'pi pi-th-large'"
						:label="isSelectionMode ? 'Cancel' : 'Select Area'"
						size="small"
						:severity="isSelectionMode ? 'danger' : 'primary'"
						:outlined="!isSelectionMode"
						:title="isSelectionMode ? 'Cancel selection mode (Escape)' : 'Draw rectangle to select markers'"
					/>
				</div>
			</div>
		</template>

		<div
			class="map-container"
			style="height: 100%; display: flex; flex-direction: column; gap: 1rem"
		>
			<div
				ref="mapContainer"
				style="
					flex: 1;
					min-height: 500px;
					border: 1px solid #ddd;
					border-radius: 6px;
					background: #f5f5f5;
				"
				class="google-map-container"
			>
				<div v-if="!isMapLoaded" class="flex align-items-center justify-content-center h-full">
					<div class="flex flex-column align-items-center gap-2">
						<i class="pi pi-spin pi-spinner text-2xl text-primary"></i>
						<span class="text-lg">Loading Interactive Google Maps...</span>
					</div>
				</div>
			</div>

			<div class="text-sm text-500">
				<div class="mb-2">
					<strong>Interactive Map:</strong> 🖱️ Click and drag to pan • 🔍 Scroll to zoom • 📍 Click
					markers for details
					<span v-if="isSelectionMode" class="ml-3 text-primary font-semibold">
						🎯 Draw a rectangle to select markers
					</span>
					<span v-else-if="selectedMarkersCount > 0" class="ml-3 text-primary">
						✨ {{ selectedMarkersCount }} markers selected • Press Delete to clear
					</span>
				</div>
			</div>
		</div>
	</Dialog>
</template>

<style scoped>
.map-dialog .p-dialog-content {
	padding: 1rem;
	height: calc(100% - 80px);
}

.google-map-container {
	border-radius: 6px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	overflow: hidden;
}

.map-container {
	height: 100%;
}
</style>
