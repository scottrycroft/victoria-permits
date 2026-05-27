import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
	plugins: [vue() as any],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url))
		}
	},
	define: {
		__APP_VERSION__: JSON.stringify("test"),
		__BUILD_TIME__: JSON.stringify(new Date().toISOString())
	},
	test: {
		environment: "happy-dom",
		globals: true,
		setupFiles: ["./src/__tests__/setup.ts"],
		server: {
			deps: {
				inline: ["primevue"]
			}
		}
	}
});
