import "fake-indexeddb/auto";
import { vi } from "vitest";
import { config } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";

// Stub import.meta.env values used by the app
vi.stubEnv("VITE_APP_TITLE", "Permits");
vi.stubEnv("BASE_URL", "/");

// Mock the Google Maps API globally
(globalThis as any).google = {
	maps: {
		Geocoder: class {
			geocode() {}
		},
		Map: class {},
		Marker: class {},
		InfoWindow: class {},
		LatLng: class {
			constructor(public lat: number, public lng: number) {}
		},
		LatLngBounds: class {
			extend() {
				return this;
			}
		},
		event: {
			addListener() {},
			removeListener() {}
		},
		GeocoderStatus: { OK: "OK" }
	}
};

// Install PrimeVue and ToastService globally for all test components
config.global.plugins = [
	[
		PrimeVue,
		{
			theme: "none"
		}
	],
	ToastService
];

// Provide stubs for components that are hard to render in tests
config.global.stubs = {
	MapDialog: true,
	DebugDialog: true,
	Toast: true
};
