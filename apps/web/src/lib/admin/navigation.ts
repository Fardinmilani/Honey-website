export const adminSections = [
  { path: 'catalog', permission: 'catalog:read' },
  { path: 'media', permission: 'content:write' },
  { path: 'pricing', permission: 'pricing:read' },
  { path: 'inventory', permission: 'inventory:read' },
  { path: 'sourcing', permission: 'inventory:read' },
  { path: 'procurement', permission: 'procurement:read' },
  { path: 'orders', permission: 'order:read' },
  { path: 'customers', permission: 'customer:read' },
  { path: 'settings', permission: 'settings:read' },
  { path: 'audit', permission: 'audit:read' },
] as const;
