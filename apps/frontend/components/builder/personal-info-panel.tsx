'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PersonalInfo } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface PersonalInfoPanelProps {
  data: PersonalInfo;
  onChange: (data: PersonalInfo) => void;
}

export const PersonalInfoPanel: React.FC<PersonalInfoPanelProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleChange = (field: keyof PersonalInfo, value: string) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  const inputClassName =
    'rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent';

  return (
    <div className="border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-700"></div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider">
            {t('builder.personalInfo')}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-black p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="pi-name"
                className="font-mono text-xs uppercase tracking-wider text-gray-500"
              >
                {t('resume.personalInfo.name')}
              </Label>
              <Input
                id="pi-name"
                value={data.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={t('builder.personalInfoForm.placeholders.name')}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="pi-title"
                className="font-mono text-xs uppercase tracking-wider text-gray-500"
              >
                {t('resume.personalInfo.title')}
              </Label>
              <Input
                id="pi-title"
                value={data.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder={t('builder.personalInfoForm.placeholders.title')}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="pi-email"
                className="font-mono text-xs uppercase tracking-wider text-gray-500"
              >
                {t('resume.personalInfo.email')}
              </Label>
              <Input
                id="pi-email"
                type="email"
                value={data.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder={t('builder.personalInfoForm.placeholders.email')}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="pi-phone"
                className="font-mono text-xs uppercase tracking-wider text-gray-500"
              >
                {t('resume.personalInfo.phone')}
              </Label>
              <Input
                id="pi-phone"
                type="tel"
                value={data.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder={t('builder.personalInfoForm.placeholders.phone')}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="pi-location"
                className="font-mono text-xs uppercase tracking-wider text-gray-500"
              >
                {t('resume.personalInfo.location')}
              </Label>
              <Input
                id="pi-location"
                value={data.location || ''}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder={t('builder.personalInfoForm.placeholders.location')}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="pi-website"
                className="font-mono text-xs uppercase tracking-wider text-gray-500"
              >
                {t('resume.personalInfo.website')}
              </Label>
              <Input
                id="pi-website"
                value={data.website || ''}
                onChange={(e) => handleChange('website', e.target.value)}
                placeholder={t('builder.personalInfoForm.placeholders.website')}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="pi-linkedin"
                className="font-mono text-xs uppercase tracking-wider text-gray-500"
              >
                {t('resume.personalInfo.linkedin')}
              </Label>
              <Input
                id="pi-linkedin"
                value={data.linkedin || ''}
                onChange={(e) => handleChange('linkedin', e.target.value)}
                placeholder={t('builder.personalInfoForm.placeholders.linkedin')}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="pi-github"
                className="font-mono text-xs uppercase tracking-wider text-gray-500"
              >
                {t('resume.personalInfo.github')}
              </Label>
              <Input
                id="pi-github"
                value={data.github || ''}
                onChange={(e) => handleChange('github', e.target.value)}
                placeholder={t('builder.personalInfoForm.placeholders.github')}
                className={inputClassName}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
