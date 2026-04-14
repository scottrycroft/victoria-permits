<script setup lang="ts">
import { computed } from "vue";
import { displayFolderNumber } from "@/utils";
import type { PermitsEntity } from "@/types/Permits";

const props = defineProps<{
	permit?: PermitsEntity;
	city?: string;
	folderNumber?: string;
}>();

const resolvedCity = computed(() => props.permit?.city ?? props.city ?? "");
const resolvedFolderNumber = computed(() => props.permit?.folderNumber ?? props.folderNumber ?? "");

const displayText = computed(() => displayFolderNumber(resolvedCity.value, resolvedFolderNumber.value));

const titleText = computed(() =>
	resolvedCity.value === "Richmond" ? resolvedFolderNumber.value : undefined
);
</script>

<template>
	<span :title="titleText">{{ displayText }}</span>
</template>
