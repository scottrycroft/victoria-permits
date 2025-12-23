<script setup lang="ts">
import { db } from "@/db";
import type { DocumentsEntity, DocumentsEntity2 } from "@/types/Permits";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { useToast } from "primevue/usetoast";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
	visible: boolean;
}>();

const emit = defineEmits<{
	"update:visible": [value: boolean];
}>();

const toast = useToast();

// Generic helper function to download documents from a table
async function downloadDocuments(
	tableName: "clickedDocs" | "clickedDocs2",
	toastDetail: string
) {
	const docs = await db[tableName].toArray();
	docs.sort((a, b) => a.docURL.localeCompare(b.docURL));
	const dataStr =
		"data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(docs, null, 2));
	const downloadAnchorNode = document.createElement("a");
	downloadAnchorNode.setAttribute("href", dataStr);
	downloadAnchorNode.setAttribute("download", `${tableName}.json`);
	document.body.appendChild(downloadAnchorNode); // required for firefox
	downloadAnchorNode.click();
	downloadAnchorNode.remove();
	toast.add({
		severity: "success",
		summary: "Download Started",
		detail: toastDetail,
		life: 3000
	});
}

// Generic helper function to import documents into a table
async function importDocuments(
	tableName: "clickedDocs" | "clickedDocs2",
	validateFn: (item: any) => boolean,
	requiredFields: string
) {
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
			const data = JSON.parse(text) as (DocumentsEntity | DocumentsEntity2)[];
			
			// Validate the data structure
			if (!Array.isArray(data)) {
				throw new Error("JSON file must contain an array of documents");
			}
			
			// Validate each item has the required fields
			for (const item of data) {
				if (!validateFn(item)) {
					throw new Error(`Each document must have ${requiredFields} fields`);
				}
			}
			
			// Add documents to the database (bulkPut will add or update)
			if (tableName === "clickedDocs") {
				await db.clickedDocs.bulkPut(data as DocumentsEntity[]);
			} else {
				await db.clickedDocs2.bulkPut(data as DocumentsEntity2[]);
			}
			
			toast.add({
				severity: "success",
				summary: "Import Successful",
				detail: `Successfully imported ${data.length} documents into ${tableName}.`,
				life: 5000
			});
		} catch (error) {
			console.error(`Error importing ${tableName}:`, error);
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

async function downloadViewedDocs() {
	await downloadDocuments("clickedDocs", "Viewed documents download started.");
}

async function downloadClickedDocs2() {
	await downloadDocuments("clickedDocs2", "ClickedDocs2 download started.");
}

async function importClickedDocs() {
	await importDocuments(
		"clickedDocs",
		(item: any) => item.docName && item.docURL,
		"'docName' and 'docURL'"
	);
}

async function importClickedDocs2() {
	await importDocuments(
		"clickedDocs2",
		(item: any) => item.city && item.permitID && item.docName && item.docURL,
		"'city', 'permitID', 'docName' and 'docURL'"
	);
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

async function compareClickedDocs() {
	// Get all documents from both tables
	const clickedDocs = await db.clickedDocs.toArray();
	const clickedDocs2 = await db.clickedDocs2.toArray();

	// Extract docURL values into Sets for efficient comparison
	const docURLsInClickedDocs = new Set(clickedDocs.map((doc) => doc.docURL));
	const docURLsInClickedDocs2 = new Set(clickedDocs2.map((doc) => doc.docURL));

	// Find docURLs in clickedDocs but not in clickedDocs2
	const inClickedDocsOnly = clickedDocs.filter((doc) => !docURLsInClickedDocs2.has(doc.docURL));

	// Find docURLs in clickedDocs2 but not in clickedDocs
	const inClickedDocs2Only = clickedDocs2.filter((doc) => !docURLsInClickedDocs.has(doc.docURL));

	// Log the results
	console.log("=== ClickedDocs Comparison ===");
	console.log(`Total in clickedDocs: ${clickedDocs.length}`);
	console.log(`Total in clickedDocs2: ${clickedDocs2.length}`);

	console.log(`\nIn clickedDocs2 but NOT in clickedDocs (${inClickedDocs2Only.length}):`);
	inClickedDocs2Only.forEach((doc) => {
		console.log(`  - ${doc.docURL} (${doc.docName}, ${doc.city}, ${doc.permitID})`);
	});
	console.log("=== End Comparison ===");

	// Show toast notification
	toast.add({
		severity: "info",
		summary: "Comparison Complete",
		detail: `Found ${inClickedDocsOnly.length} in clickedDocs only, ${inClickedDocs2Only.length} in clickedDocs2 only. Check console.`,
		life: 5000
	});
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
			</div>
		</template>

		<div class="flex gap-2 flex-wrap">
			<Button icon="pi pi-download" label="Download Viewed Docs" @click="downloadViewedDocs" />
			<Button icon="pi pi-download" label="Download ClickedDocs2" @click="downloadClickedDocs2" />
			<Button
				icon="pi pi-download"
				label="Export Address Locations"
				@click="downloadAddressLocations"
			/>
			<Button icon="pi pi-search" label="Compare ClickedDocs Tables" @click="compareClickedDocs" />
			<Button icon="pi pi-upload" label="Import Clicked Docs" @click="importClickedDocs" />
			<Button icon="pi pi-upload" label="Import ClickedDocs2" @click="importClickedDocs2" />
		</div>
	</Dialog>
</template>

<style scoped></style>
