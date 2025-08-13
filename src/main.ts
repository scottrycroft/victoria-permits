import "./assets/main.css";

import "primeicons/primeicons.css";
import "primeflex/primeflex.css";

import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Aura from "@primevue/themes/aura";
import { definePreset } from "@primevue/themes";
import App from "./App.vue";
import router from "./router";

import ToastService from "primevue/toastservice";

const CustomAura = definePreset(Aura, {
    semantic: {
        primary: {
            50: '{violet.50}',
            100: '{violet.100}',
            200: '{violet.200}',
            300: '{violet.300}',
            400: '{violet.400}',
            500: '{violet.500}',
            600: '{violet.600}',
            700: '{violet.700}',
            800: '{violet.800}',
            900: '{violet.900}',
            950: '{violet.950}'
        }
    }
});

const app = createApp(App);

app.use(router);
app.use(ToastService);
app.use(PrimeVue, {
    theme: {
        preset: CustomAura,
        options: {
            prefix: 'p',
            darkModeSelector: 'none',
            cssLayer: false
        }
    }
});

app.mount("#app");
