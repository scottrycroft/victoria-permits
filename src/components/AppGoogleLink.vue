<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	address: string;
	city: string;
}>();

const googleHref = computed(
	() => `https://www.google.com/maps?q=${encodeURIComponent(props.address)}, ${encodeURIComponent(props.city)}`
);
</script>

<template>
	<a :href="googleHref" target="_blank">{{ address }}</a>
</template>
