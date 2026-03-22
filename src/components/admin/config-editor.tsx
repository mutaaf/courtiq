'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Save, RotateCcw, Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { ConfigScope } from '@/types/database';

interface ConfigFieldDef {
  key: string;
  label: string;
  description: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'string_array' | 'select' | 'color' | 'json';
  defaultValue: unknown;
  options?: string[];
  overridableAt: ('org' | 'team')[];
}

interface ConfigEditorProps {
  domain: string;
  orgId: string;
  teamId?: string;
  fields: ConfigFieldDef[];
  values: Record<string, unknown>;
  sources: Record<string, ConfigScope>;
  onSave?: () => void;
}

export function ConfigEditor({ domain, orgId, teamId, fields, values, sources, onSave }: ConfigEditorProps) {
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');

  const hasChanges = Object.keys(editedValues).length > 0;

  const getValue = (key: string) => {
    if (key in editedValues) return editedValues[key];
    return values[key];
  };

  const setValue = (key: string, value: unknown) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const resetField = (key: string) => {
    setEditedValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    try {
      for (const [key, value] of Object.entries(editedValues)) {
        await fetch(`/api/config/${domain}/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value,
            scope: teamId ? 'team' : 'org',
            orgId,
            teamId,
            reason,
          }),
        });
      }

      setEditedValues({});
      setReason('');
      onSave?.();
    } catch (err) {
      console.error('Save config error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (key: string) => {
    await fetch(`/api/config/${domain}/${key}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, teamId }),
    });
    onSave?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">{domain} Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">{field.label}</label>
                <p className="text-xs text-zinc-500">{field.description}</p>
              </div>
              <InheritanceBadge source={sources[field.key] || 'system'} />
            </div>

            {field.type === 'text' && (
              <Input
                value={(getValue(field.key) as string) || ''}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            )}

            {field.type === 'textarea' && (
              <Textarea
                value={(getValue(field.key) as string) || ''}
                onChange={(e) => setValue(field.key, e.target.value)}
                rows={4}
              />
            )}

            {field.type === 'number' && (
              <Input
                type="number"
                value={(getValue(field.key) as number) || 0}
                onChange={(e) => setValue(field.key, Number(e.target.value))}
              />
            )}

            {field.type === 'boolean' && (
              <button
                onClick={() => setValue(field.key, !getValue(field.key))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  getValue(field.key) ? 'bg-orange-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getValue(field.key) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            )}

            {field.type === 'string_array' && (
              <StringArrayEditor
                value={(getValue(field.key) as string[]) || []}
                onChange={(val) => setValue(field.key, val)}
              />
            )}

            {field.type === 'color' && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(getValue(field.key) as string) || '#F97316'}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-zinc-700"
                />
                <Input
                  value={(getValue(field.key) as string) || ''}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  className="w-32"
                />
              </div>
            )}

            {sources[field.key] !== 'system' && (
              <button
                onClick={() => handleReset(field.key)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                <RotateCcw className="mr-1 inline h-3 w-3" />
                Reset to default
              </button>
            )}
          </div>
        ))}

        {hasChanges && (
          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <Input
              placeholder="Reason for change (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="ghost" onClick={() => setEditedValues({})}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InheritanceBadge({ source }: { source: ConfigScope }) {
  const variants: Record<ConfigScope, { label: string; variant: 'secondary' | 'default' | 'warning' }> = {
    system: { label: 'System', variant: 'secondary' },
    org: { label: 'Org', variant: 'default' },
    team: { label: 'Team', variant: 'warning' },
  };

  const { label, variant } = variants[source];
  return <Badge variant={variant}>{label}</Badge>;
}

function StringArrayEditor({ value, onChange }: { value: string[]; onChange: (val: string[]) => void }) {
  const [newItem, setNewItem] = useState('');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((item, i) => (
          <span key={i} className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1 text-sm">
            {item}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <X className="h-3 w-3 text-zinc-500 hover:text-zinc-300" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add item..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newItem.trim()) {
              e.preventDefault();
              onChange([...value, newItem.trim()]);
              setNewItem('');
            }
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (newItem.trim()) {
              onChange([...value, newItem.trim()]);
              setNewItem('');
            }
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export { InheritanceBadge, StringArrayEditor };
