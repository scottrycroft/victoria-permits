<script setup lang="ts">
import { computed } from "vue";
import { geocodingService } from "@/geocoding";
import type { PermitsEntity } from "@/types/Permits";

const props = defineProps<{
	address: string;
	city: string;
	permit?: PermitsEntity;
}>();

const googleHref = computed(
	() =>
		`https://www.google.com/maps?q=${encodeURIComponent(props.address)}, ${encodeURIComponent(
			props.city
		)}`
);

// Geocode and cache the address when the link is clicked
const handleClick = async () => {
	// Only geocode if we have a full permit object
	if (props.permit) {
		try {
			await geocodingService.geocodeAndCachePermit(props.permit);
		} catch (error) {
			console.warn("Failed to geocode permit address:", error);
		}
	}
};
</script>

<template>
	<a
		:href="googleHref"
		target="_blank"
		@click="handleClick"
		@click.middle="handleClick"
		@click.right="handleClick"
		>{{ address }}</a
	>
</template>
