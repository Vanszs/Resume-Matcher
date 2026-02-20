'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PROVIDER_INFO,
  type LLMProvider,
  type UserLLMConfig,
  fetchUserLLMConfigs,
} from '@/lib/api/config';
import { ProviderConfigCard } from './provider-config-card';
import { useTranslations } from '@/lib/i18n';
import { Key, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PROVIDERS: LLMProvider[] = [
  'openai',
  'anthropic',
  'openrouter',
  'gemini',
  'deepseek',
  'ollama',
];

interface MultiProviderConfigProps {
  onConfigChange?: () => void;
}

export function MultiProviderConfig({ onConfigChange }: MultiProviderConfigProps) {
  const { t } = useTranslations();
  const [configs, setConfigs] = useState<UserLLMConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUserLLMConfigs();
      setConfigs(data);
    } catch (e) {
      setError((e as Error).message || t('settings.errors.failedToLoadConfigs'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const getConfigForProvider = (provider: LLMProvider): UserLLMConfig | null => {
    return configs.find((c) => c.provider === provider) || null;
  };

  const getDefaultProvider = (): LLMProvider | null => {
    const defaultConfig = configs.find((c) => c.is_default);
    return defaultConfig ? (defaultConfig.provider as LLMProvider) : null;
  };

  const handleConfigUpdated = () => {
    loadConfigs();
    onConfigChange?.();
  };

  const handleSetDefault = () => {
    loadConfigs();
    onConfigChange?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-2 border-red-300 bg-red-50 p-6 space-y-4">
        <p className="font-mono text-sm text-red-700">{error}</p>
        <Button variant="outline" onClick={loadConfigs} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const defaultProvider = getDefaultProvider();
  const configuredProviders = configs.filter(
    (c) => c.api_key_masked || PROVIDER_INFO[c.provider as LLMProvider]?.requiresKey === false
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-b border-black/10 pb-2">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
            {t('settings.multiProvider.title')}
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={loadConfigs} className="gap-1 text-xs">
          <RefreshCw className="w-3 h-3" />
          {t('common.refresh')}
        </Button>
      </div>

      <p className="text-sm text-gray-600">{t('settings.multiProvider.description')}</p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
          <span className="font-mono text-xs uppercase text-gray-500">
            {t('settings.multiProvider.configuredProviders')}
          </span>
          <span className="font-mono text-2xl font-bold block mt-1">
            {configuredProviders.length} / {PROVIDERS.length}
          </span>
        </div>
        <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
          <span className="font-mono text-xs uppercase text-gray-500">
            {t('settings.multiProvider.activeProvider')}
          </span>
          <span className="font-mono text-lg font-bold block mt-1">
            {defaultProvider
              ? PROVIDER_INFO[defaultProvider].name
              : t('settings.multiProvider.noneSet')}
          </span>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="space-y-3">
        {PROVIDERS.map((provider) => (
          <ProviderConfigCard
            key={provider}
            provider={provider}
            config={getConfigForProvider(provider)}
            isDefault={provider === defaultProvider}
            onConfigUpdated={handleConfigUpdated}
            onSetDefault={handleSetDefault}
          />
        ))}
      </div>
    </section>
  );
}
