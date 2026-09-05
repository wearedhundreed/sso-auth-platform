export type PopNotificationType =
  | 'CODERABBIT_FIX'
  | 'CODERABBIT_APPROVAL'
  | 'KOREY_APPROVAL'
  | 'GITHUB_WEBHOOK'
  | 'GITHUB_AUTH_SUCCESS'
  | 'CI_PASSED';

export interface GitHubPopNotification {
  id: string;
  type: PopNotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  badge: string;
  icon: 'rabbit' | 'bot' | 'git' | 'shield' | 'check';
  linkTab?: string;
  metadata?: Record<string, unknown>;
}

// In-memory notification store with real-time buffer
const popNotifications: GitHubPopNotification[] = [
  {
    id: 'pop_init_1',
    type: 'CODERABBIT_APPROVAL',
    title: 'CodeRabbit Bot: All Fixes Auto-Approved',
    message: 'PR #42: Automatically fixed 3 type safety & lint errors and submitted APPROVE review.',
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    read: false,
    badge: 'CodeRabbit AI',
    icon: 'rabbit',
    linkTab: 'webhooks',
  },
  {
    id: 'pop_init_2',
    type: 'GITHUB_AUTH_SUCCESS',
    title: 'GitHub SSO Preferred Provider Configured',
    message: 'Callback URL /auth/github/callback active with PKCE and State protection.',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    read: false,
    badge: 'GitHub OAuth',
    icon: 'git',
    linkTab: 'dashboard',
  },
];

export function emitGitHubPopNotification(params: {
  type: PopNotificationType;
  title: string;
  message: string;
  badge?: string;
  icon?: 'rabbit' | 'bot' | 'git' | 'shield' | 'check';
  linkTab?: string;
  metadata?: Record<string, unknown>;
}): GitHubPopNotification {
  const icon =
    params.icon ||
    (params.type.includes('CODERABBIT')
      ? 'rabbit'
      : params.type.includes('KOREY')
      ? 'bot'
      : params.type.includes('AUTH')
      ? 'git'
      : 'shield');

  const badge =
    params.badge ||
    (params.type.startsWith('CODERABBIT')
      ? 'CodeRabbit'
      : params.type.startsWith('KOREY')
      ? '@Korey'
      : 'GitHub');

  const notification: GitHubPopNotification = {
    id: `pop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: params.type,
    title: params.title,
    message: params.message,
    timestamp: new Date().toISOString(),
    read: false,
    badge,
    icon,
    linkTab: params.linkTab,
    metadata: params.metadata,
  };

  popNotifications.unshift(notification);
  if (popNotifications.length > 50) {
    popNotifications.pop();
  }

  return notification;
}

export function getRecentPopNotifications(limit = 30): GitHubPopNotification[] {
  return popNotifications.slice(0, limit);
}

export function markPopNotificationRead(id: string): boolean {
  const notif = popNotifications.find((n) => n.id === id);
  if (notif) {
    notif.read = true;
    return true;
  }
  return false;
}

export function markAllPopNotificationsRead(): void {
  popNotifications.forEach((n) => {
    n.read = true;
  });
}

export function clearAllPopNotifications(): void {
  popNotifications.length = 0;
}
