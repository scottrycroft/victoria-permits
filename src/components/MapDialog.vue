<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from "vue";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import type { PermitsEntity } from "@/types/Permits";
import { db } from "@/db";

const props = defineProps<{
	visible: boolean;
	permits: PermitsEntity[];
}>();

const emit = defineEmits<{
	"update:visible": [value: boolean];
}>();

const toast = useToast();
const mapContainer = ref<HTMLElement | null>(null);
const map = ref<google.maps.Map | null>(null);
const markers = ref<google.maps.Marker[]>([]);
const geocoder = ref<google.maps.Geocoder | null>(null);
const isMapLoaded = ref(false);
const isLoadingMarkers = ref(false);

const API_KEY = "AIzaSyB-AAgFz8X7o_N5vmiLU1MoKPUVa6_0NPA";

const dialogVisible = computed({
	get: () => props.visible,
	set: (value: boolean) => emit("update:visible", value)
});

// Filter for only active permits and sort by most recently updated
const activePermits = computed(() => {
	const inactiveStatuses = [
		'Closed',
		'Complete',
		'Completed',
		'Cancelled',
		'Canceled',
		'Withdrawn',
		'Expired',
		'Denied',
		'Rejected',
		'Finalized',
		'Final'
	];
	
	const filtered = props.permits.filter(permit =>
		permit.status && !inactiveStatuses.some(status =>
			permit.status.toLowerCase().includes(status.toLowerCase())
		)
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
			console.log('Google Maps API already loaded');
			resolve();
			return;
		}

		// Create callback function name
		const callbackName = 'initGoogleMapsCallback_' + Date.now();
		
		// Create global callback
		(window as any)[callbackName] = () => {
			console.log('Google Maps API callback executed');
			console.log('Checking post-load availability:');
			console.log('- google.maps:', !!window.google?.maps);
			
			delete (window as any)[callbackName];
			resolve();
		};

		const script = document.createElement('script');
		const apiUrl = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=${callbackName}`;
		console.log('Loading Google Maps API with URL:', apiUrl);
		script.src = apiUrl;
		script.async = true;
		script.defer = true;
		
		script.onerror = (error) => {
			console.error('Failed to load Google Maps script:', error);
			delete (window as any)[callbackName];
			reject(new Error('Failed to load Google Maps API'));
		};
		
		document.head.appendChild(script);
	});
};

// Initialize the interactive map
const initializeMap = async () => {
	if (!mapContainer.value || map.value || !props.visible) return;

	try {
		console.log('Loading Google Maps API...');
		await loadGoogleMapsAPI();
		
		console.log('Google Maps API loaded successfully');
		
		// Default center on Victoria, BC
		const defaultCenter = { lat: 48.4284, lng: -123.3656 };
		
		console.log('Creating map');
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
		
		console.log('Map initialized successfully');

		// Add permit markers
		await addPermitMarkers();

	} catch (error) {
		console.error('Failed to initialize map:', error);
		toast.add({
			severity: "error",
			summary: "Map Error",
			detail: "Failed to load interactive Google Maps. Please check your connection."
		});
	}
};

// Clear existing markers
const clearMarkers = () => {
	console.log('Clearing', markers.value.length, 'Markers');
	markers.value.forEach((marker: google.maps.Marker) => {
		marker.setMap(null);
	});
	markers.value = [];
};

// Add interactive markers for permit addresses with hover tooltips
const addPermitMarkers = async () => {
	if (!map.value || !geocoder.value) return;

	isLoadingMarkers.value = true;
	clearMarkers();

	const bounds = new google.maps.LatLngBounds();
	let hasValidLocations = false;

	// Process permits in batches to avoid rate limits
	const batchSize = 5;
	const maxPermits = Math.min(activePermits.value.length, 100);
	
	for (let i = 0; i < maxPermits; i += batchSize) {
		const batch = activePermits.value.slice(i, i + batchSize);
		
		await Promise.all(batch.map(async (permit) => {
			try {
				const address = `${permit.primaryStreetName}, ${permit.city}, BC, Canada`;
				
				const result = await geocodeAddress(address);
				if (result) {
					console.log('Creating marker for permit:', permit.folderNumber, 'at position:', result);
					
					let marker: google.maps.Marker;
					
					try {
						// Use classic Google Maps Marker instead of AdvancedMarkerElement
						marker = new google.maps.Marker({
							position: result,
							map: map.value,
							title: `${permit.folderNumber}: ${permit.primaryStreetName}`,
						});
						
						console.log('Classic Marker created successfully:', marker);
						console.log('Marker position set to:', result);
						console.log('Marker map reference:', marker.getMap());
						
						// Verify marker is actually on the map
						setTimeout(() => {
							console.log('Marker check after 1 second - still on map:', marker.getMap() === map.value);
						}, 1000);
					} catch (error) {
						console.error('Failed to create classic Marker for permit', permit.folderNumber, ':', error);
						throw error;
					}


					// Add click event for more details using classic Marker API
					marker.addListener('click', () => {
						map.value?.setCenter(result);
						map.value?.setZoom(15);
						
						// Show detailed info window
						const detailWindow = new google.maps.InfoWindow({
							content: `
								<div style="padding: 12px; min-width: 250px;">
									<h4 style="margin: 0 0 8px 0; color: #1a73e8;">
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
								</div>
							`,
							pixelOffset: new google.maps.Size(0, -30)
						});
						
						detailWindow.open(map.value, marker);
					});

					markers.value.push(marker);
					bounds.extend(result);
					hasValidLocations = true;
				}
			} catch (error) {
				console.warn(`Failed to geocode address: ${permit.primaryStreetName}, ${permit.city}`, error);
			}
		}));

		// Small delay between batches to respect rate limits
		if (i + batchSize < maxPermits) {
			await new Promise(resolve => setTimeout(resolve, 200));
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

	isLoadingMarkers.value = false;
};

// Geocode an address with caching
const geocodeAddress = async (address: string): Promise<google.maps.LatLngLiteral | null> => {
	if (!geocoder.value) {
		console.log('Geocoder not available');
		return null;
	}

	console.log(`Geocoding address: ${address}`);

	try {
		// First check if we have this address cached
		console.log(`Checking cache for: ${address}`);
		const cachedLocation = await db.addressLocations.get({address});
		if (cachedLocation) {
			console.log(`✅ Using cached location for: ${address}`, cachedLocation);
			return {
				lat: cachedLocation.lat,
				lng: cachedLocation.lng
			};
		} else {
			console.log(`❌ No cached result for: ${address}`);
		}

		// If not cached, perform geocoding
		console.log(`📍 Performing fresh geocoding for: ${address}`);
		return new Promise((resolve) => {
			geocoder.value!.geocode({
				address,
				componentRestrictions: {
					country: 'CA',
					administrativeArea: 'BC'
				}
			}, async (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
				if (status === 'OK' && results && results[0]) {
					const location = results[0].geometry.location;
					const coords = {
						lat: location.lat(),
						lng: location.lng()
					};
					
					console.log(`✅ Geocoding successful for: ${address}`, coords);
					
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
			});
		});
	} catch (error) {
		console.error(`💥 Error in geocodeAddress for: ${address}`, error);
		return null;
	}
};

// View all active locations
const viewAllLocations = () => {
	const searchQuery = activePermits.value.slice(0, 20).map(permit => 
		`"${permit.primaryStreetName}, ${permit.city}"`
	).join(' OR ');
	
	const url = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
	window.open(url, "_blank");
};

// Watch for dialog visibility changes
watch(() => props.visible, async (newVisible) => {
	if (newVisible) {
		await nextTick();
		if (!isMapLoaded.value) {
			await initializeMap();
		} else {
			// Map already exists, just trigger resize for proper display
			console.log('Map already loaded, triggering resize for instant display');
			if (map.value) {
				// Multiple refresh attempts for proper display after hidden->visible transition
				setTimeout(() => {
					if (map.value) {
						// Comprehensive refresh sequence
						google.maps.event.trigger(map.value, 'resize');
						const currentCenter = map.value.getCenter();
						const currentZoom = map.value.getZoom();
						
						if (currentCenter && currentZoom !== undefined) {
							// Force redraw by slightly changing zoom and back
							map.value.setZoom(currentZoom + 0.1);
							setTimeout(() => {
								if (map.value && currentCenter) {
									map.value.setZoom(currentZoom);
									map.value.setCenter(currentCenter);
									// Trigger another resize after zoom change
									google.maps.event.trigger(map.value, 'resize');
								}
							}, 50);
						}
					}
				}, 100);
			}
		}
	}
	// Note: We preserve the map state when dialog closes for instant reopening
});

// Watch for permit changes
watch(() => activePermits.value, async () => {
	if (isMapLoaded.value && props.visible) {
		await addPermitMarkers();
	}
}, { deep: true });

onMounted(() => {
	if (props.visible) {
		nextTick(() => {
			initializeMap();
		});
	}
});

onUnmounted(() => {
	clearMarkers();
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
			<div class="flex align-items-center gap-3">
				<h3 class="m-0">Active Permit Locations - Interactive Map</h3>
				<span class="text-sm text-500">({{ activePermits.length }} active of {{ permits.length }} total)</span>
				<div v-if="isLoadingMarkers" class="flex align-items-center gap-2 ml-3">
					<i class="pi pi-spin pi-spinner text-sm"></i>
					<span class="text-sm">Loading markers...</span>
				</div>
			</div>
		</template>

		<div class="map-container" style="height: 100%; display: flex; flex-direction: column; gap: 1rem;">
			<div class="flex gap-2 align-items-center flex-wrap">
				<Button 
					@click="viewAllLocations" 
					icon="pi pi-search" 
					label="Search All Active"
					size="small"
					outlined
					:disabled="activePermits.length === 0"
				/>
				<div v-if="markers.length > 0" class="text-sm text-600">
					📍 {{ markers.length }} permit markers displayed
				</div>
			</div>

			<div 
				ref="mapContainer"
				style="flex: 1; min-height: 500px; border: 1px solid #ddd; border-radius: 6px; background: #f5f5f5;"
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
					<strong>Interactive Map:</strong> 🖱️ Click and drag to pan • 🔍 Scroll to zoom • 🎯 Hover over markers for permit info • 📍 Click markers for details
				</div>
				<div class="flex gap-4 flex-wrap">
					<span>📍 <strong>Location pins:</strong> Active permit locations</span>
					<span v-if="activePermits.length > 50">⚡ <strong>Performance:</strong> Showing first 50 locations for optimal loading</span>
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
