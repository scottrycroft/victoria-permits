<script setup lang="ts">
import { db } from "@/db";
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

async function downloadViewedDocs() {
	const viewedDocs = await db.clickedDocs.toArray();
	viewedDocs.sort((a, b) => a.docURL.localeCompare(b.docURL));
	const dataStr =
		"data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(viewedDocs, null, 2));
	const downloadAnchorNode = document.createElement("a");
	downloadAnchorNode.setAttribute("href", dataStr);
	downloadAnchorNode.setAttribute("download", "viewed_documents.json");
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

		<div>
			<Button icon="pi pi-download" label="Download Viewed Docs" @click="downloadViewedDocs" />
		</div>
	</Dialog>
</template>

<style scoped></style>
