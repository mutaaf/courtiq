// Webhook event definitions — safe for client and server import
import type { WebhookEvent } from '@/types/database';

export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string; description: string }[] = [
  { value: 'observation.created', label: 'Observation Created', description: 'A new observation is saved' },
  { value: 'session.created', label: 'Session Created', description: 'A new session is started' },
  { value: 'session.updated', label: 'Session Updated', description: 'A session is modified (e.g. ended)' },
  { value: 'plan.created', label: 'Plan Created', description: 'An AI plan is generated' },
  { value: 'player.created', label: 'Player Created', description: 'A new player is added to the roster' },
  { value: 'team.archived', label: 'Team Archived', description: 'A team was archived (read-only) by an admin' },
  { value: 'team.unarchived', label: 'Team Unarchived', description: 'A previously archived team was restored' },
  { value: 'team.deleted', label: 'Team Deleted', description: 'A team and its records were permanently deleted' },
];
