'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatTime } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';

function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) return '(none)';
  if (typeof value === 'string') return value || '(empty)';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty list)';
    return value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '(empty)';
    // Show up to 3 key:value pairs inline; truncate rest
    const parts = entries.slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    return parts.join(', ') + (entries.length > 3 ? ` (+${entries.length - 3} more)` : '');
  }
  return String(value);
}

interface AuditLogViewerProps {
  orgId: string;
  domain?: string;
}

export function AuditLogViewer({ orgId, domain }: AuditLogViewerProps) {
  const { data: logs = [] } = useQuery({
    queryKey: ['audit-log', orgId, domain],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('config_audit_log')
        .select('*, coaches(full_name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (domain) {
        query = query.eq('domain', domain);
      }

      const { data } = await query;
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration Change Log</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">No configuration changes yet.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log: any) => (
              <div key={log.id} className="rounded-lg border border-zinc-800 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{log.coaches?.full_name || 'Unknown'}</span>
                    <Badge variant="secondary" className="text-xs">{log.action}</Badge>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {formatDate(log.created_at)} {formatTime(log.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">
                  {log.domain} &rarr; {log.key}
                </p>
                {log.previous_value !== null && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Changed:{' '}
                    <span className="font-mono text-zinc-400">{formatConfigValue(log.previous_value)}</span>
                    {' '}&rarr;{' '}
                    <span className="font-mono text-emerald-400">{formatConfigValue(log.new_value)}</span>
                  </p>
                )}
                {log.change_reason && (
                  <p className="mt-1 text-xs text-zinc-400 italic">&ldquo;{log.change_reason}&rdquo;</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
