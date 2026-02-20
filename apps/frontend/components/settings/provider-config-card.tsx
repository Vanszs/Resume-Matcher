'use client';

import React, { useState, useEffect } from 'react';
import {
  PROVIDER_INFO,
  type LLMProvider,
  type UserLLMConfig,
  upsertUserLLMConfig,
  setDefaultProvider,
} from '@/lib/api/config';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
import { CheckCircle2, Loader2, Save, Star, StarOff, ChevronDown, ChevronUp } from 'lucide-react';

interface ProviderConfigCardProps {
  provider: LLMProvider;
  config: UserLLMConfig | null;
  isDefault: boolean;
  onConfigUpdated: () => void;
  onSetDefault: (provider: LLMProvider) => void;
  disabled?: boolean;
}

export function ProviderConfigCard({
  provider,
  config,
  isDefault,
  onConfigUpdated,
  onSetDefault,
  disabled = false,
}: ProviderConfigCardProps) {
  const { t } = useTranslations();
  const providerInfo = PROVIDER_INFO[provider];

  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form with existing config
  useEffect(() => {
    if (config) {
      setModel(config.model || '');
      setBaseUrl(config.base_url || '');
      // API key is masked, don't populate
    }
  }, [config]);

  const hasApiKey = Boolean(config?.api_key_masked);
  const requiresKey = providerInfo.requiresKey ?? true;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const payload: {
        provider: LLMProvider;
        model?: string;
        base_url?: string;
        api_key?: string;
        is_default?: boolean;
      } = {
        provider,
        model: model.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
      };

      // Only send API key if user typed one
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }

      // If this is the first config being saved, make it default
      if (!config && isDefault === false) {
        payload.is_default = true;
      }

      await upsertUserLLMConfig(payload);
      setApiKey(''); // Clear the input after save
      setSaved(true);
      onConfigUpdated();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message || t('settings.errors.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async () => {
    try {
      await setDefaultProvider(provider);
      onSetDefault(provider);
    } catch (e) {
      setError((e as Error).message || t('settings.errors.failedToSetDefault'));
    }
  };

  const isConfigured = hasApiKey || !requiresKey;

  return (
    <div
      className={`border-2 transition-all ${
        isDefault
          ? 'border-blue-700 bg-blue-50/30'
          : isConfigured
            ? 'border-green-600 bg-green-50/30'
            : 'border-gray-300 bg-white'
      }`}
    >
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors"
        disabled={disabled}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 ${
              isDefault ? 'bg-blue-700' : isConfigured ? 'bg-green-600' : 'bg-gray-300'
            }`}
          />
          <div>
            <span className="font-mono text-sm font-bold uppercase tracking-wider">
              {providerInfo.name}
            </span>
            <div className="flex items-center gap-2 mt-1">
              {isDefault && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-blue-700 bg-blue-50 font-mono text-[10px] uppercase tracking-wider text-blue-700">
                  <Star className="w-2.5 h-2.5" />
                  {t('settings.multiProvider.activeProvider')}
                </span>
              )}
              {isConfigured && !isDefault && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-green-600 bg-green-50 font-mono text-[10px] uppercase tracking-wider text-green-700">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {t('settings.multiProvider.configured')}
                </span>
              )}
              {!isConfigured && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
                  {t('settings.multiProvider.notConfigured')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config?.model && (
            <span className="font-mono text-xs text-gray-500 hidden sm:block">{config.model}</span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 space-y-4 bg-white/80">
          {/* Set as Default Button */}
          {isConfigured && !isDefault && (
            <button
              type="button"
              onClick={handleSetDefault}
              className="w-full flex items-center justify-center gap-2 p-2 border-2 border-dashed border-blue-400 text-blue-700 font-mono text-xs uppercase tracking-wider hover:bg-blue-50 transition-colors"
            >
              <Star className="w-3.5 h-3.5" />
              {t('settings.multiProvider.useAsActive')}
            </button>
          )}

          {isDefault && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200">
              <Star className="w-4 h-4 text-blue-700" />
              <span className="font-mono text-xs text-blue-700">
                {t('settings.multiProvider.currentlyActive')}
              </span>
            </div>
          )}

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor={`${provider}-apiKey`} className="flex items-center gap-2">
              {t('settings.llmConfiguration.apiKeyLabel')}
              {!requiresKey && (
                <span className="text-gray-400 text-xs">
                  ({t('settings.llmConfiguration.optional')})
                </span>
              )}
            </Label>
            <Input
              id={`${provider}-apiKey`}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                hasApiKey
                  ? config?.api_key_masked || t('settings.multiProvider.keyStored')
                  : t('settings.llmConfiguration.apiKeyPlaceholder')
              }
              className="font-mono"
              disabled={disabled}
            />
            {hasApiKey && !apiKey && (
              <p className="text-xs text-green-700 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {t('settings.llmConfiguration.leaveBlankToKeepExistingKey')}
              </p>
            )}
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor={`${provider}-model`}>{t('settings.llmConfiguration.modelLabel')}</Label>
            <Input
              id={`${provider}-model`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={providerInfo.defaultModel}
              className="font-mono"
              disabled={disabled}
            />
            <p className="text-xs text-gray-500 font-mono">
              {t('settings.llmConfiguration.defaultModel', { model: providerInfo.defaultModel })}
            </p>
          </div>

          {/* Base URL */}
          {providerInfo.supportsCustomBase && (
            <div className="space-y-2">
              <Label htmlFor={`${provider}-baseUrl`}>
                {t('settings.llmConfiguration.baseUrlLabel')}
              </Label>
              <Input
                id={`${provider}-baseUrl`}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  provider === 'ollama'
                    ? 'http://localhost:11434'
                    : provider === 'openrouter'
                      ? 'https://openrouter.ai/api/v1'
                      : t('settings.llmConfiguration.baseUrlPlaceholder')
                }
                className="font-mono"
                disabled={disabled}
              />
              {providerInfo.customBaseHint && (
                <p className="text-xs text-gray-500 font-mono">{providerInfo.customBaseHint}</p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="border border-red-300 bg-red-50 p-2">
              <p className="text-xs text-red-600 font-mono">{error}</p>
            </div>
          )}

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving || disabled} className="w-full">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                {t('common.saved')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('common.save')}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
