import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('./views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('./views/AdminView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  const { useAuthStore } = await import('./stores/auth')
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    try {
      await auth.checkAuth()
      if (!auth.isAuthenticated) {
        next('/login')
        return
      }
    } catch {
      next('/login')
      return
    }
  }

  if (to.path === '/login' && auth.isAuthenticated) {
    next('/dashboard')
    return
  }

  next()
})
