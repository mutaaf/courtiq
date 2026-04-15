'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Webhook,
  Plus,
  Trash2,
  Zap,
  Copy,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { WEBHOOK_EVENTS } from '@/lib/webhook-events';
import type { WebhookEvent } from '@/types/database';

interface WebhookRow {
  id: string;
  url: string;
  events: WebhookEvent[];
  is_active: boolean;
  last_triggered_at: string | null;
  last_status: number | null;
  created_at: string;
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status, lastAt }: { status: number | null; lastAt: string | null }) {
  if (!lastAt) return <span className="text-xs text-zinc-500">Never fired</span>;
  const ok = status !== null && status >= 200 && status < 300;
  const date = new Date(lastAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <span className={`text-xs ${ok ? 'text-emerald-400' : 'text-rose-400'}`}>
      {ok ? 'OK' : 'Failed'} {status ? `(${status})` : ''} · {date}
    </span>
  );
}

// ─── Event checkbox strip ─────────────────────────────────────────────────────

function EventCheckboxes({
  selected,
  onChange,
}: {
  selected: WebhookEvent[];
  onChange: (events: WebhookEvent[]) => void;
}) {
  const toggle = (val: WebhookEvent) => {
    onChange(
      selected.includes(val) ? selected.filter((e) => e !== val) : [...selected, val]
    );
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
      {WEBHOOK_EVENTS.map((ev) => {
        const active = selected.includes(ev.value);
        return (
          <button
            key={ev.value}
            type="button"
            onClick={() => toggle(ev.value)}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors touch-manipulation active:scale-[0.98] ${
              active
                ? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {active ? (
              <CheckSquare className="h-4 w-4 mt-0.5 shrink-0 text-orange-400" />
            ) : (
              <Square className="h-4 w-4 mt-0.5 shrink-0 text-zinc-600" />
            )}
            <span>
              <span className="font-medium block">{ev.label}</span>
              <span className="text-xs opacity-60">{ev.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── New webhook form ─────────────────────────────────────────────────────────

function AddWebhookForm({ onCreated }: { onCreated: (secret: string) => void }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['observation.created']);
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create webhook');
      return json.webhook;
    },
    onSuccess: (webhook) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setUrl('');
      setEvents(['observation.created']);
      setError('');
      onCreated(webhook.secret);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4 text-orange-400" />
          Add Endpoint
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">URL (must be https://)</label>
          <Input
            type="url"
            placeholder="https://your-server.com/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Events to receive</label>
          <EventCheckboxes selected={events} onChange={setEvents} />
        </div>
        {error && (
          <p className="flex items-center gap-1 text-sm text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !url || events.length === 0}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white"
        >
          {createMutation.isPending ? 'Creating…' : 'Create Webhook'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Webhook row ──────────────────────────────────────────────────────────────

function WebhookItem({ hook }: { hook: WebhookRow }) {
  const queryClient = useQueryClient();
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testing, setTesting] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/webhooks/${hook.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/webhooks/${hook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !hook.is_active }),
      });
      if (!res.ok) throw new Error('Toggle failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/webhooks/${hook.id}/test`, { method: 'POST' });
      const json = await res.json();
      setTestResult(json.success ? 'ok' : 'fail');
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className={`transition-opacity ${!hook.is_active ? 'opacity-60' : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm text-zinc-100 truncate">{hook.url}</p>
            <StatusPill status={hook.last_status} lastAt={hook.last_triggered_at} />
          </div>
          <Badge
            className={`shrink-0 text-xs cursor-pointer ${
              hook.is_active
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-700 text-zinc-400'
            }`}
            onClick={() => toggleMutation.mutate()}
          >
            {hook.is_active ? 'Active' : 'Paused'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1">
          {hook.events.map((ev) => (
            <span
              key={ev}
              className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
            >
              {ev}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !hook.is_active}
            className="h-9 gap-1.5"
          >
            {testing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : testResult === 'ok' ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : testResult === 'fail' ? (
              <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {testing ? 'Sending…' : testResult === 'ok' ? 'Sent!' : testResult === 'fail' ? 'Failed' : 'Send test'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm('Delete this webhook?')) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="h-9 text-rose-400 hover:text-rose-300 border-rose-500/30 hover:border-rose-500/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Secret reveal modal ──────────────────────────────────────────────────────

function SecretBanner({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium text-amber-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Copy your webhook secret — it won't be shown again
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-200 break-all">
            {secret}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={copy}
            className="h-9 shrink-0 gap-1.5"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="text-xs text-zinc-400">
          Use this secret to verify incoming requests: compute{' '}
          <code className="text-zinc-300">HMAC-SHA256(secret, body)</code> and compare against the{' '}
          <code className="text-zinc-300">X-SportsIQ-Signature</code> header.
        </p>
        <Button variant="outline" size="sm" onClick={onDismiss} className="w-full h-9">
          I've saved it — dismiss
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ webhooks: WebhookRow[] }>({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const res = await fetch('/api/webhooks');
      if (!res.ok) throw new Error('Failed to load webhooks');
      return res.json();
    },
  });

  const hooks = data?.webhooks ?? [];

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6 text-orange-400" />
            Integration Webhooks
          </h1>
          <p className="text-zinc-400 text-sm">
            Push SportsIQ events to your own systems (Slack, Make, Zapier, custom servers)
          </p>
        </div>
      </div>

      {/* How it works */}
      <Card className="border-zinc-700">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium text-zinc-200">How it works</p>
          <ul className="space-y-1 text-xs text-zinc-400 list-disc list-inside">
            <li>Register an HTTPS endpoint and choose which events to receive</li>
            <li>SportsIQ POSTs a JSON payload with an HMAC-SHA256 signature header</li>
            <li>Verify the signature using your webhook secret before processing</li>
          </ul>
          <p className="text-xs text-zinc-500 pt-1">
            Headers: <code className="text-zinc-400">X-SportsIQ-Event</code>,{' '}
            <code className="text-zinc-400">X-SportsIQ-Signature</code>,{' '}
            <code className="text-zinc-400">X-SportsIQ-Timestamp</code>
          </p>
        </CardContent>
      </Card>

      {/* New secret reveal */}
      {newSecret && (
        <SecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />
      )}

      {/* Existing webhooks */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : hooks.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
            {hooks.length} registered endpoint{hooks.length !== 1 ? 's' : ''}
          </p>
          {hooks.map((hook) => (
            <WebhookItem key={hook.id} hook={hook} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <Webhook className="mx-auto h-10 w-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400">No webhooks yet</p>
          <p className="text-xs text-zinc-600 mt-1">Add your first endpoint below</p>
        </div>
      )}

      {/* Add form */}
      <AddWebhookForm onCreated={(secret) => setNewSecret(secret)} />
    </div>
  );
}
