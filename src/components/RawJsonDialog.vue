<script setup lang="ts">
import type { PermitsEntity } from "@/types/Permits";
import Dialog from "primevue/dialog";
import { computed, nextTick, ref, watch } from "vue";

const props = defineProps<{
	visible: boolean;
	current: PermitsEntity | null;
	previous: PermitsEntity | null;
}>();

const emit = defineEmits<{
	"update:visible": [value: boolean];
}>();

const dialogVisible = computed({
	get: () => props.visible,
	set: (value: boolean) => emit("update:visible", value)
});

const currentJson = computed(() =>
	props.current ? JSON.stringify(props.current, null, 2) : ""
);

const previousJson = computed(() =>
	props.previous ? JSON.stringify(props.previous, null, 2) : ""
);

// Refs for the two scrollable panes
const currentPane = ref<HTMLElement | null>(null);
const previousPane = ref<HTMLElement | null>(null);

// Guard to prevent infinite scroll event loops
let isSyncing = false;

function onCurrentScroll() {
	if (isSyncing) return;
	isSyncing = true;
	if (currentPane.value && previousPane.value) {
		previousPane.value.scrollTop = currentPane.value.scrollTop;
		previousPane.value.scrollLeft = currentPane.value.scrollLeft;
	}
	isSyncing = false;
}

function onPreviousScroll() {
	if (isSyncing) return;
	isSyncing = true;
	if (currentPane.value && previousPane.value) {
		currentPane.value.scrollTop = previousPane.value.scrollTop;
		currentPane.value.scrollLeft = previousPane.value.scrollLeft;
	}
	isSyncing = false;
}

// Reset scroll positions when dialog opens
watch(
	() => props.visible,
	async (newVisible) => {
		if (newVisible) {
			await nextTick();
			if (currentPane.value) currentPane.value.scrollTop = 0;
			if (previousPane.value) previousPane.value.scrollTop = 0;
		}
	}
);
</script>

<template>
	<Dialog
		v-model:visible="dialogVisible"
		:dismissableMask="true"
		:style="{ width: '95vw', height: '90vh' }"
		header="Raw JSON Comparison"
		:modal="true"
		class="raw-json-dialog"
	>
		<div class="json-container">
			<div class="json-pane">
				<h4 class="pane-header">Current</h4>
				<div
					ref="currentPane"
					class="json-content"
					@scroll="onCurrentScroll"
				>
					<pre>{{ currentJson }}</pre>
				</div>
			</div>
			<div class="json-pane">
				<h4 class="pane-header">Previous</h4>
				<div
					ref="previousPane"
					class="json-content"
					@scroll="onPreviousScroll"
				>
					<pre>{{ previousJson }}</pre>
				</div>
			</div>
		</div>
	</Dialog>
</template>

<style scoped>
.json-container {
	display: flex;
	gap: 1rem;
	height: calc(90vh - 120px);
}

.json-pane {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}

.pane-header {
	margin: 0 0 0.5rem 0;
	font-size: 1rem;
	font-weight: 600;
}

.json-content {
	flex: 1;
	overflow: auto;
	border: 1px solid #ddd;
	border-radius: 6px;
	background: #1e1e1e;
	color: #d4d4d4;
	padding: 0.75rem;
}

.json-content pre {
	margin: 0;
	white-space: pre;
	font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
	font-size: 0.85rem;
	line-height: 1.4;
}
</style>
