import os

filepath = 'photobooth-server/frontend/src/router.ts'
with open(filepath, 'r') as f:
    content = f.read()

route_to_add = """    {
      path: '/events/:id/remote',
      name: 'event-remote',
      component: () => import('./views/EventRemoteView.vue'),
      meta: { requiresAuth: true },
    },
"""

content = content.replace("    {\n      path: '/events/:id/analytics',", route_to_add + "    {\n      path: '/events/:id/analytics',")

with open(filepath, 'w') as f:
    f.write(content)
