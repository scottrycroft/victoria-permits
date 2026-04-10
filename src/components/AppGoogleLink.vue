<script setup lang="ts">
import { computed } from "vue";
import { geocodingService } from "@/geocoding";
import type { PermitsEntity } from "@/types/Permits";

const props = defineProps<{
	address: string;
	city: string;
	permit?: PermitsEntity;
}>();

const hasCoordinates = computed(
	() => props.permit?.latitude != null && props.permit?.longitude != null
);

const googleHref = computed(() => {
	if (hasCoordinates.value) {
		if (props.address) {
			const addressPart = `${encodeURIComponent(props.address)}, ${encodeURIComponent(props.city)}`;
			return `https://www.google.com/maps?q=${addressPart}+@${props.permit!.latitude},${props.permit!.longitude}`;
		}
		// No address but has coordinates — link directly to lat/lng
		return `https://www.google.com/maps?q=${props.permit!.latitude},${props.permit!.longitude}`;
	}
	const addressPart = `${encodeURIComponent(props.address)}, ${encodeURIComponent(props.city)}`;
	return `https://www.google.com/maps?q=${addressPart}`;
});

const displayText = computed(() => {
	if (props.address) return props.address;
	if (hasCoordinates.value) return `${props.permit!.latitude}, ${props.permit!.longitude}`;
	return "";
});

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
		v-if="displayText"
		:href="googleHref"
		target="_blank"
		@click="handleClick"
		@click.middle="handleClick"
		@click.right="handleClick"
		>{{ displayText }}</a
	>
</template>
