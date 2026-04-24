<script setup lang="ts">
import { db } from "@/db";
import type { DocumentEntity, AddressLocation, FavouritePermit, PermitsEntityDB } from "@/types/Permits";
import { favouritesService } from "@/favourites";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Select from "primevue/select";
import { useToast } from "primevue/usetoast";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
const appVersion = __APP_VERSION__
const buildTime = new Date(__BUILD_TIME__).toLocaleString()

const props = defineProps<{
	visible: boolean;
	showOnlyMinor: boolean | null;
}>();

const emit = defineEmits<{
	"update:visible": [value: boolean];
	"update:showOnlyMinor": [value: boolean | null];
}>();

const localShowOnlyMinor = computed({
	get: () => props.showOnlyMinor,
	set: (value: boolean | null) => emit("update:showOnlyMinor", value)
});

const toast = useToast();

// Storage persistence status
const storagePersisted = ref<boolean | null>(null);

async function downloadViewedDocs() {
	const docs = await db.clickedDocs.toArray();
	docs.sort((a, b) => a.docURL.localeCompare(b.docURL));
	const dataStr =
		"data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(docs, null, 2));
	const downloadAnchorNode = document.createElement("a");
	downloadAnchorNode.setAttribute("href", dataStr);
	downloadAnchorNode.setAttribute("download", "clickedDocs.json");
	document.body.appendChild(downloadAnchorNode); // required for firefox
	downloadAnchorNode.click();
	downloadAnchorNode.remove();
	toast.add({
		severity: "success",
		summary: "Download Started",
		detail: "Viewed documents download started.",
		life: 3000
	});
}

async function importViewedDocs() {
	// Create a file input element
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json";

	input.onchange = async (e: Event) => {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) {
			return;
		}

		try {
			// Read the file
			const text = await file.text();
			const data = JSON.parse(text) as DocumentEntity[];

			// Validate the data structure
			if (!Array.isArray(data)) {
				throw new Error("JSON file must contain an array of documents");
			}

			// Validate each item has the required fields
			for (const item of data) {
				if (!item.city || !item.permitID || !item.docName || !item.docURL) {
					throw new Error(
						"Each document must have 'city', 'permitID', 'docName' and 'docURL' fields"
					);
				}
			}

			// Add documents to the database (bulkPut will add or update)
			await db.clickedDocs.bulkPut(data);

			toast.add({
				severity: "success",
				summary: "Import Successful",
				detail: `Successfully imported ${data.length} viewed documents.`,
				life: 5000
			});
		} catch (error) {
			console.error("Error importing viewed docs:", error);
			toast.add({
				severity: "error",
				summary: "Import Failed",
				detail: error instanceof Error ? error.message : "Failed to import documents",
				life: 5000
			});
		}
	};

	// Trigger the file picker
	input.click();
}

async function downloadAddressLocations() {
	const addressLocations = await db.addressLocations.toArray();
	// Sort by address for stable output
	addressLocations.sort((a, b) => a.address.localeCompare(b.address));
	// Remove the database ID field and keep only relevant data
	const exportData = addressLocations.map(({ address, lat, lng }) => ({ address, lat, lng }));
	const dataStr =
		"data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
	const downloadAnchorNode = document.createElement("a");
	downloadAnchorNode.setAttribute("href", dataStr);
	downloadAnchorNode.setAttribute("download", "address_locations.json");
	document.body.appendChild(downloadAnchorNode); // required for firefox
	downloadAnchorNode.click();
	downloadAnchorNode.remove();
	toast.add({
		severity: "success",
		summary: "Download Started",
		detail: "Address locations download started.",
		life: 3000
	});
}

async function importAddressLocations() {
	// Create a file input element
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json";

	input.onchange = async (e: Event) => {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) {
			return;
		}

		try {
			// Read the file
			const text = await file.text();
			const data = JSON.parse(text) as AddressLocation[];

			// Validate the data structure
			if (!Array.isArray(data)) {
				throw new Error("JSON file must contain an array of address locations");
			}

			// Validate each item has the required fields
			for (const item of data) {
				if (!item.address || typeof item.lat !== "number" || typeof item.lng !== "number") {
					throw new Error("Each address location must have 'address', 'lat', and 'lng' fields");
				}
			}

			// Add address locations to the database (bulkPut will add or update)
			await db.addressLocations.bulkPut(data);

			toast.add({
				severity: "success",
				summary: "Import Successful",
				detail: `Successfully imported ${data.length} address locations.`,
				life: 5000
			});
		} catch (error) {
			console.error("Error importing address locations:", error);
			toast.add({
				severity: "error",
				summary: "Import Failed",
				detail: error instanceof Error ? error.message : "Failed to import address locations",
				life: 5000
			});
		}
	};

	// Trigger the file picker
	input.click();
}

async function searchDocsByName() {
	const searchTerm = prompt("Enter document name to search (partial match, case insensitive):");

	if (!searchTerm) {
		return; // User cancelled or entered empty string
	}

	try {
		const clickedDocs = await db.clickedDocs.toArray();

		// Filter documents where docName partially matches (case insensitive)
		const searchLower = searchTerm.toLowerCase();
		const matchingDocs = clickedDocs.filter((doc) =>
			doc.docName.toLowerCase().includes(searchLower)
		);

		// Convert to IndexedDB key format (array syntax)
		// clickedDocs key: [city+permitID+docName]
		const docKeys = matchingDocs.map((doc) => [doc.city, doc.permitID, doc.docName]);

		// Log results to console
		console.log("=== Document Search Results ===");
		console.log(`Search term: "${searchTerm}"`);
		console.log(`\nMatching documents (${matchingDocs.length}):`);
		console.log(docKeys);
		console.log("=== End Search Results ===");

		// Show toast notification
		toast.add({
			severity: "info",
			summary: "Search Complete",
			detail: `Found ${matchingDocs.length} matching documents. Check console.`,
			life: 5000
		});
	} catch (error) {
		console.error("Error searching documents:", error);
		toast.add({
			severity: "error",
			summary: "Search Failed",
			detail: error instanceof Error ? error.message : "Failed to search documents",
			life: 5000
		});
	}
}

async function requestPersistentStorage() {
	try {
		if (navigator.storage && navigator.storage.persist) {
			const granted = await navigator.storage.persist();
			// Update the displayed value
			storagePersisted.value = granted;

			if (granted) {
				toast.add({
					severity: "success",
					summary: "Persistent Storage Granted",
					detail: "Storage will not be cleared automatically.",
					life: 5000
				});
			} else {
				toast.add({
					severity: "warn",
					summary: "Persistent Storage Denied",
					detail: "The browser denied the request. Storage may be cleared under pressure.",
					life: 5000
				});
			}
		} else {
			toast.add({
				severity: "error",
				summary: "Not Supported",
				detail: "Persistent storage API is not available in this browser.",
				life: 5000
			});
		}
	} catch (error) {
		console.error("Error requesting persistent storage:", error);
		toast.add({
			severity: "error",
			summary: "Request Failed",
			detail: error instanceof Error ? error.message : "Failed to request persistent storage",
			life: 5000
		});
	}
}

async function downloadFavourites() {
	const favourites = await favouritesService.exportFavourites();
	const dataStr =
		"data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(favourites, null, 2));
	const downloadAnchorNode = document.createElement("a");
	downloadAnchorNode.setAttribute("href", dataStr);
	downloadAnchorNode.setAttribute("download", "favourites.json");
	document.body.appendChild(downloadAnchorNode); // required for firefox
	downloadAnchorNode.click();
	downloadAnchorNode.remove();
	toast.add({
		severity: "success",
		summary: "Download Started",
		detail: `Favourites download started (${favourites.length} favourites).`,
		life: 3000
	});
}

async function importFavourites() {
	// Create a file input element
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json";

	input.onchange = async (e: Event) => {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) {
			return;
		}

		try {
			// Read the file
			const text = await file.text();
			const data = JSON.parse(text) as FavouritePermit[];

			// Import using the favourites service
			const count = await favouritesService.importFavourites(data);

			toast.add({
				severity: "success",
				summary: "Import Successful",
				detail: `Successfully imported ${count} favourites.`,
				life: 5000
			});
		} catch (error) {
			console.error("Error importing favourites:", error);
			toast.add({
				severity: "error",
				summary: "Import Failed",
				detail: error instanceof Error ? error.message : "Failed to import favourites",
				life: 5000
			});
		}
	};

	// Trigger the file picker
	input.click();
}

interface DeletedDoc {
	name: string;
	url: string;
}

interface DocDeletionResult {
	city: string;
	folderNumber: string;
	deletedDocs: DeletedDoc[];
}

interface ProgressDeletionResult {
	city: string;
	folderNumber: string;
	deletedProgress: string[];
}

const docDeletionResults = ref<DocDeletionResult[] | null>(null);
const findingDocDeletions = ref(false);

const progressDeletionResults = ref<ProgressDeletionResult[] | null>(null);
const findingProgressDeletions = ref(false);

async function findPermitsWithDeletedDocs() {
	findingDocDeletions.value = true;
	docDeletionResults.value = null;
	try {
		const currentPermits = await db.lastSeenPermits
			.where("dbVersion" as any)
			.equals("current")
			.toArray() as PermitsEntityDB[];

		const results: DocDeletionResult[] = [];

		for (const current of currentPermits) {
			if (results.length >= 5) break;

			const previousArr = await db.lastSeenPermits
				.where({ dbVersion: "previous", city: current.city, folderNumber: current.folderNumber })
				.toArray() as PermitsEntityDB[];
			const previous = previousArr[0];

			if (!previous || current.lastUpdated === previous.lastUpdated) continue;

			const deletedDocs = previous.documents
				.filter(
					(prevDoc) =>
						!current.documents.some(
							(doc) => doc.docName === prevDoc.docName && doc.docURL === prevDoc.docURL
						)
				)
				.map((d) => ({ name: d.docName || d.docURL, url: d.docURL }));

			if (deletedDocs.length > 0) {
				results.push({
					city: current.city,
					folderNumber: current.folderNumber,
					deletedDocs
				});
			}
		}

		docDeletionResults.value = results;
	} finally {
		findingDocDeletions.value = false;
	}
}

async function findPermitsWithDeletedProgress() {
	findingProgressDeletions.value = true;
	progressDeletionResults.value = null;
	try {
		const currentPermits = await db.lastSeenPermits
			.where("dbVersion" as any)
			.equals("current")
			.toArray() as PermitsEntityDB[];

		const results: ProgressDeletionResult[] = [];

		for (const current of currentPermits) {
			if (results.length >= 5) break;

			const previousArr = await db.lastSeenPermits
				.where({ dbVersion: "previous", city: current.city, folderNumber: current.folderNumber })
				.toArray() as PermitsEntityDB[];
			const previous = previousArr[0];

			if (!previous || current.lastUpdated === previous.lastUpdated) continue;

			const deletedProgress = previous.progressSections
				.filter(
					(prev) =>
						!current.progressSections.some(
							(cur) => cur.taskDescription === prev.taskDescription && cur.taskType === prev.taskType
						)
				)
				.map((p) => p.taskDescription || p.taskType);

			if (deletedProgress.length > 0) {
				results.push({
					city: current.city,
					folderNumber: current.folderNumber,
					deletedProgress
				});
			}
		}

		progressDeletionResults.value = results;
	} finally {
		findingProgressDeletions.value = false;
	}
}

const dialogVisible = computed({
	get: () => props.visible,
	set: (value: boolean) => emit("update:visible", value)
});

// Watch for dialog visibility changes
watch(
	() => props.visible,
	async (newVisible) => {
		if (newVisible) {
			console.log("Debug Dialog opening - initializing");
			// Check storage persistence status
			if (navigator.storage && navigator.storage.persisted) {
				storagePersisted.value = await navigator.storage.persisted();
			} else {
				storagePersisted.value = null;
			}
			await nextTick();
		} else {
			console.log("Debug Dialog closing - cleaning up");
		}
	}
);

onMounted(() => {
	if (props.visible) {
		nextTick(() => {});
	}
});

onUnmounted(() => {});
</script>

<template>
	<Dialog
		v-model:visible="dialogVisible"
		:dismissableMask="true"
		:style="{ width: '95vw', height: '90vh' }"
		header="Debug Dialog"
		:modal="true"
		class="debug-dialog"
	>
		<template #header>
			<div class="flex align-items-center gap-3">
				<h3 class="m-0">Debug Dialog</h3>
				<span class="text-sm text-color-secondary">v{{ appVersion }} — built {{ buildTime }}</span>
			</div>
		</template>

		<div class="mb-3">
			<h4 class="mt-0 mb-2">Filters</h4>
			<div class="flex align-items-center gap-2">
				<label for="filterMinor">Minor permits:</label>
				<Select
					v-model="localShowOnlyMinor"
					inputId="filterMinor"
					:options="[
						{ label: 'All', value: null },
						{ label: 'Minor only', value: true },
						{ label: 'Non-minor only', value: false }
					]"
					optionLabel="label"
					optionValue="value"
					placeholder="All"
					style="min-width: 150px"
				/>
			</div>
		</div>

		<div class="mb-3">
			<h4 class="mt-0 mb-2">Storage Information</h4>
			<div class="flex align-items-center gap-2 mb-2">
				<strong>Storage Persisted:</strong>
				<span v-if="storagePersisted === null" class="text-color-secondary">
					Not available or checking...
				</span>
				<span v-else-if="storagePersisted" class="text-green-600">
					✓ Yes (storage will not be cleared)
				</span>
				<span v-else class="text-orange-600"> ✗ No (storage may be cleared under pressure) </span>
			</div>
			<Button
				v-if="storagePersisted === false"
				icon="pi pi-lock"
				label="Request Persistent Storage"
				@click="requestPersistentStorage"
				severity="secondary"
				size="small"
			/>
		</div>

		<div class="flex gap-2 flex-wrap">
			<Button icon="pi pi-download" label="Download Viewed Docs" @click="downloadViewedDocs" />
			<Button
				icon="pi pi-download"
				label="Export Address Locations"
				@click="downloadAddressLocations"
			/>
			<Button
				icon="pi pi-download"
				label="Export Favourites"
				@click="downloadFavourites"
				severity="warning"
			/>
			<Button icon="pi pi-file-search" label="Search Docs by Name" @click="searchDocsByName" />
			<Button icon="pi pi-upload" label="Import Viewed Docs" @click="importViewedDocs" />
			<Button
				icon="pi pi-upload"
				label="Import Address Locations"
				@click="importAddressLocations"
			/>
			<Button
				icon="pi pi-upload"
				label="Import Favourites"
				@click="importFavourites"
				severity="warning"
			/>
			<Button
				icon="pi pi-search"
				label="Find Deleted Docs"
				@click="findPermitsWithDeletedDocs"
				:loading="findingDocDeletions"
				severity="danger"
			/>
			<Button
				icon="pi pi-search"
				label="Find Deleted Tasks"
				@click="findPermitsWithDeletedProgress"
				:loading="findingProgressDeletions"
				severity="danger"
			/>
		</div>

		<div v-if="docDeletionResults !== null" class="mt-3">
			<h4 class="mt-0 mb-2">Permits with Removed Documents (first 5)</h4>
			<div v-if="docDeletionResults.length === 0" class="text-color-secondary">
				No permits with deleted documents found.
			</div>
			<div v-else class="flex flex-column gap-2">
				<div
					v-for="result in docDeletionResults"
					:key="result.city + result.folderNumber"
					class="border-1 border-round p-2"
					style="border-color: var(--colour-data-deleted); background: #fff5f5"
				>
					<div class="font-bold mb-1">{{ result.city }} — {{ result.folderNumber }}</div>
					<div class="text-sm">
						<span class="font-semibold">Removed docs:</span>
						<template v-for="(doc, i) in result.deletedDocs" :key="doc.url">
							<span :title="doc.url">{{ doc.name }}</span><span v-if="i < result.deletedDocs.length - 1">, </span>
						</template>
					</div>
				</div>
			</div>
		</div>

		<div v-if="progressDeletionResults !== null" class="mt-3">
			<h4 class="mt-0 mb-2">Permits with Removed Tasks (first 5)</h4>
			<div v-if="progressDeletionResults.length === 0" class="text-color-secondary">
				No permits with deleted task progress found.
			</div>
			<div v-else class="flex flex-column gap-2">
				<div
					v-for="result in progressDeletionResults"
					:key="result.city + result.folderNumber"
					class="border-1 border-round p-2"
					style="border-color: var(--colour-data-deleted); background: #fff5f5"
				>
					<div class="font-bold mb-1">{{ result.city }} — {{ result.folderNumber }}</div>
					<div class="text-sm">
						<span class="font-semibold">Removed tasks:</span>
						{{ result.deletedProgress.join(", ") }}
					</div>
				</div>
			</div>
		</div>
	</Dialog>
</template>

<style scoped>
/* Ensure toasts appear above the dialog */
:deep(.p-toast) {
	z-index: 9999 !important;
}
</style>
