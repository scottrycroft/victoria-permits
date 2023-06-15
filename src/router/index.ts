import { createRouter, createWebHistory } from 'vue-router'
import AppPermitsVue from '@/components/AppPermits.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: AppPermitsVue
    }
  ]
})

export default router
