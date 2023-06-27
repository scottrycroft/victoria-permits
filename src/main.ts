import './assets/main.css'

import 'primeicons/primeicons.css';
//theme
import "primevue/resources/themes/lara-light-indigo/theme.css";     
    
//core
import "primevue/resources/primevue.min.css";

import "primeflex/primeflex.css";

import { createApp } from 'vue'
import PrimeVue from 'primevue/config';
import App from './App.vue'
import router from './router'

import ToastService from 'primevue/toastservice';

const app = createApp(App)

app.use(router)
app.use(ToastService);
app.use(PrimeVue);

app.mount('#app')
