<script setup lang="ts">
import type { PermitsEntity } from "@/types/Permits";
import Dialog from "primevue/dialog";
import ToggleSwitch from "primevue/toggleswitch";
import { computed, nextTick, ref, watch } from "vue";
import { createPatch } from "diff";
import { html, parse } from "diff2html";
import type { DiffFile } from "diff2html/lib/types";
import "diff2html/bundles/css/diff2html.min.css";

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

const wordWrap = ref(false);

const isNewPermit = computed(() => !props.previous);

const dialogTitle = computed(() =>
	isNewPermit.value ? "Raw JSON — New Permit" : "Raw JSON — Comparison"
);

const diffHtml = computed(() => {
	const oldJson = props.previous ? JSON.stringify(props.previous, null, 2) : "";
	const newJson = props.current ? JSON.stringify(props.current, null, 2) : "";

	const patch = createPatch("permit.json", oldJson, newJson, "Previous", "Current", { context: 9999 });
	const diffJson: DiffFile[] = parse(patch);

	return html(diffJson, {
		drawFileList: false,
		matching: "words",
		outputFormat: "side-by-side"
	});
});

watch(
	() => props.visible,
	async (newVisible) => {
		if (newVisible) {
			await nextTick();
			wordWrap.value = false;
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
		<template #header>
			<div class="flex align-items-center gap-3 w-full">
				<span class="p-dialog-title">{{ dialogTitle }}</span>
				<div class="flex align-items-center gap-2 ml-auto mr-4">
					<label for="wordWrapToggle" class="text-sm">Word Wrap</label>
					<ToggleSwitch v-model="wordWrap" inputId="wordWrapToggle" />
				</div>
			</div>
		</template>
		<div
			class="diff-container"
			:class="{ 'word-wrap': wordWrap }"
			v-html="diffHtml"
		/>
	</Dialog>
</template>

<style scoped>
.diff-container {
	height: calc(90vh - 120px);
	overflow: auto;
}

.diff-container :deep(.d2h-wrapper) {
	height: 100%;
}

.diff-container :deep(.d2h-file-header) {
	display: none;
}

.diff-container :deep(.d2h-file-wrapper) {
	border: none;
	margin-bottom: 0;
}

/* Dark theme overrides */
.diff-container :deep(.d2h-code-side-linenumber),
.diff-container :deep(.d2h-code-linenumber) {
	background-color: #1e1e1e;
	color: #858585;
	border-color: #333;
}

.diff-container :deep(.d2h-code-side-line),
.diff-container :deep(.d2h-code-line) {
	background-color: #1e1e1e;
	color: #d4d4d4;
}

.diff-container :deep(.d2h-file-side-diff),
.diff-container :deep(.d2h-file-diff) {
	background-color: #1e1e1e;
}

.diff-container :deep(td.d2h-code-side-linenumber),
.diff-container :deep(td.d2h-code-linenumber) {
	position: sticky;
	left: 0;
	z-index: 1;
}

/* Deletions - red */
.diff-container :deep(.d2h-del) {
	background-color: #3e1a1e;
	color: #d4d4d4;
	border-color: #5c2d33;
}

.diff-container :deep(.d2h-del .d2h-code-side-linenumber),
.diff-container :deep(.d2h-del .d2h-code-linenumber) {
	background-color: #3e1a1e;
	color: #858585;
	border-color: #5c2d33;
}

.diff-container :deep(del) {
	background-color: #6e2029;
	text-decoration: none;
}

/* Additions - green */
.diff-container :deep(.d2h-ins) {
	background-color: #1a3e1e;
	color: #d4d4d4;
	border-color: #2d5c33;
}

.diff-container :deep(.d2h-ins .d2h-code-side-linenumber),
.diff-container :deep(.d2h-ins .d2h-code-linenumber) {
	background-color: #1a3e1e;
	color: #858585;
	border-color: #2d5c33;
}

.diff-container :deep(ins) {
	background-color: #296e2e;
	text-decoration: none;
}

/* Column header styling */
.diff-container :deep(.d2h-file-side-diff .d2h-code-side-emptyplaceholder),
.diff-container :deep(.d2h-emptyplaceholder) {
	background-color: #2a2a2a;
	border-color: #333;
}

/* Table styling */
.diff-container :deep(table) {
	border-collapse: collapse;
	font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
	font-size: 0.85rem;
}

.diff-container :deep(td) {
	border-color: #333;
}

/* Info/context lines */
.diff-container :deep(.d2h-info) {
	background-color: #2a2d3a;
	color: #7cafc2;
	border-color: #333;
}

/* Word wrap toggle */
.diff-container.word-wrap :deep(.d2h-code-line-ctn),
.diff-container.word-wrap :deep(.d2h-code-side-line) {
	white-space: pre-wrap;
	word-break: break-all;
}
</style>
