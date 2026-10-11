export const notificationsModuleMeta = {
  name: 'notifications',
  owns: ['notification_template', 'notification_delivery', 'newsletter_subscription'],
  permissions: ['content:read', 'content:write'],
} as const;
