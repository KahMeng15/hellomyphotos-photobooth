import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/events',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
    },
    {
      path: '/events',
      name: 'events',
      component: () => import('./views/EventListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/events/:id',
      name: 'event-detail',
      component: () => import('./views/EventDetailView.vue'),
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
    {
      path: '/share/:token',
      name: 'share',
      component: () => import('./views/ShareView.vue'),
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('./views/UsersView.vue'),
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
    next('/events')
    return
  }

  next()
})
