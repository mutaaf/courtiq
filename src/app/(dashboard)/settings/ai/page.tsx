'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Key, Check, X, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface ProviderConfig {
  id: string;
  name: string;
  model: string;
  emoji: string;
  keyUrl: string;
  placeholder: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    model: 'Claude 3.5 Sonnet',
    emoji: '\u{1F7E0}',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    model: 'GPT-4o',
    emoji: '\u{1F7E2}',
    keyUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-...',
  },
  {
    id: 'gemini',
    name: 'Google',
    model: 'Gemini 2.5 Flash',
    emoji: '\u{1F535}',
    keyUrl: 'https://aistudio.google.com/apikey',
    placeholder: 'AIza...',
  },
];

type ConnectionStatus = 'not_configured' | 'connected' | 'failed' | 'testing';

interface ProviderState {
  apiKey: string;
  maskedKey: string;
  status: ConnectionStatus;
}

export default function AISettingsPage() {
  const [providerStates, setProviderStates] = useState<Record<string, ProviderState>>({
    anthropic: { apiKey: '', maskedKey: '', status: 'not_configured' },
    openai: { apiKey: '', maskedKey: '', status: 'not_configured' },
    google: { apiKey: '', maskedKey: '', status: 'not_configured' },
  });
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fetch current config on mount
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/settings/ai-keys');
        if (res.ok) {
          const data = await res.json();
          // API returns: { provider, keys: { anthropic, openai, gemini }, envKeys: {...} }
          const newStates: Record<string, ProviderState> = {};
          for (const p of PROVIDERS) {
            const maskedKey = data.keys?.[p.id] || '';
            const hasEnvKey = data.envKeys?.[p.id] || false;
            newStates[p.id] = {
              apiKey: '',
              maskedKey: maskedKey || (hasEnvKey ? '(set via env)' : ''),
              status: maskedKey || hasEnvKey ? 'connected' : 'not_configured',
            };
          }
          setProviderStates(newStates);
          if (data.provider) {
            setActiveProvider(data.provider);
          }
        }
      } catch {
        // Silently fail, show unconfigured state
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const updateProviderKey = (providerId: string, apiKey: string) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], apiKey },
    }));
  };

  const testConnection = async (providerId: string) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], status: 'testing' },
    }));

    try {
      const keyToTest = providerStates[providerId].apiKey || undefined;
      const res = await fetch('/api/settings/ai-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, api_key: keyToTest }),
      });

      const data = await res.json();
      setProviderStates((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          status: data.success ? 'connected' : 'failed',
        },
      }));

      if (data.success) {
        showToast(`${PROVIDERS.find((p) => p.id === providerId)?.name} connection successful`, 'success');
      } else {
        showToast(data.error || 'Connection test failed', 'error');
      }
    } catch {
      setProviderStates((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], status: 'failed' },
      }));
      showToast('Failed to test connection', 'error');
    }
  };

  const saveProvider = async (providerId: string) => {
    setSaving((prev) => ({ ...prev, [providerId]: true }));

    try {
      const res = await fetch('/api/settings/ai-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          apiKey: providerStates[providerId].apiKey,
          setActive: activeProvider === providerId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProviderStates((prev) => ({
          ...prev,
          [providerId]: {
            apiKey: '',
            maskedKey: data.masked_key || prev[providerId].maskedKey,
            status: 'connected',
          },
        }));
        showToast(`${PROVIDERS.find((p) => p.id === providerId)?.name} API key saved`, 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save API key', 'error');
      }
    } catch {
      showToast('Failed to save API key', 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const setActive = async (providerId: string) => {
    setActiveProvider(providerId);
    try {
      await fetch('/api/settings/ai-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_provider: providerId }),
      });
      showToast(`${PROVIDERS.find((p) => p.id === providerId)?.name} set as default`, 'success');
    } catch {
      showToast('Failed to update default provider', 'error');
    }
  };

  const statusDot = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'bg-emerald-500';
      case 'failed':
        return 'bg-red-500';
      case 'testing':
        return 'bg-yellow-500 animate-pulse';
      default:
        return 'bg-zinc-600';
    }
  };

  const statusLabel = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'failed':
        return 'Failed';
      case 'testing':
        return 'Testing...';
      default:
        return 'Not configured';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg transition-all ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {toast.type === 'success' ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          &larr; Settings
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-100">AI & API Keys</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Configure your AI provider and API keys. Your keys are encrypted and stored securely.
        </p>
      </div>

      {/* Active Provider Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="h-4 w-4 text-orange-400" />
            Default Provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            {PROVIDERS.map((provider) => {
              const state = providerStates[provider.id];
              const isActive = activeProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  onClick={() => setActive(provider.id)}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 sm:py-2 text-sm transition-all touch-manipulation active:scale-[0.98] ${
                    isActive
                      ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-lg">{provider.emoji}</span>
                  <span className="font-medium">{provider.name}</span>
                  {state.status === 'connected' && (
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  )}
                  {isActive && <Check className="h-4 w-4 text-orange-400 ml-auto sm:ml-0" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PROVIDERS.map((provider) => {
          const state = providerStates[provider.id];
          const isSaving = saving[provider.id];
          const isActive = activeProvider === provider.id;

          return (
            <Card
              key={provider.id}
              className={
                isActive ? 'border-orange-500/30 ring-1 ring-orange-500/20' : undefined
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 sm:gap-2">
                    <span className="text-2xl sm:text-xl">{provider.emoji}</span>
                    <div>
                      <CardTitle className="text-base sm:text-sm">{provider.name}</CardTitle>
                      <p className="text-xs text-zinc-500 mt-0.5">{provider.model}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-2.5 w-2.5 sm:h-2 sm:w-2 rounded-full ${statusDot(state.status)}`} />
                    <span className="text-xs text-zinc-500">{statusLabel(state.status)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-3">
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 sm:py-2 text-sm sm:text-xs font-medium text-orange-400 hover:bg-orange-500/20 transition-colors touch-manipulation active:scale-[0.98]"
                >
                  Get a free API key
                  <ExternalLink className="h-4 w-4 sm:h-3 sm:w-3" />
                </a>

                <div className="space-y-2 sm:space-y-1.5">
                  <label className="text-sm sm:text-xs text-zinc-500">API Key</label>
                  <Input
                    type="password"
                    className="h-12 sm:h-10 text-base sm:text-sm"
                    placeholder={
                      state.maskedKey
                        ? state.maskedKey
                        : provider.placeholder
                    }
                    value={state.apiKey}
                    onChange={(e) => updateProviderKey(provider.id, e.target.value)}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-12 sm:h-9 text-base sm:text-sm"
                    onClick={() => testConnection(provider.id)}
                    disabled={state.status === 'testing'}
                  >
                    {state.status === 'testing' ? (
                      <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4 sm:h-3 sm:w-3" />
                    )}
                    Test Connection
                  </Button>
                  <Button
                    className="flex-1 h-12 sm:h-9 text-base sm:text-sm"
                    onClick={() => saveProvider(provider.id)}
                    disabled={isSaving || !state.apiKey}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 sm:h-3 sm:w-3" />
                    )}
                    Save Key
                  </Button>
                </div>

                {isActive && (
                  <Badge variant="outline" className="text-orange-400 border-orange-500/30">
                    Default
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
