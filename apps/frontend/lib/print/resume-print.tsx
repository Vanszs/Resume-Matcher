import Resume, {
  type ResumeData,
  type AdditionalSectionLabels,
  type ResumeSectionHeadings,
  type ResumeFallbackLabels,
} from '@/components/dashboard/resume-component';
import {
  type TemplateType,
  type PageSize,
  type TemplateSettings,
  type SpacingLevel,
  type HeaderFontFamily,
  type BodyFontFamily,
  type AccentColor,
  DEFAULT_TEMPLATE_SETTINGS,
} from '@/lib/types/template-settings';
import { PAGE_DIMENSIONS } from '@/lib/constants/page-dimensions';

export type ResumePrintSearchParams = {
  template?: string;
  pageSize?: string;
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  sectionSpacing?: string;
  itemSpacing?: string;
  lineHeight?: string;
  fontSize?: string;
  headerScale?: string;
  headerFont?: string;
  bodyFont?: string;
  compactMode?: string;
  showContactIcons?: string;
  accentColor?: string;
  lang?: string;
  token?: string;
};

function parseHeaderFont(value: string | undefined): HeaderFontFamily {
  if (value === 'serif' || value === 'sans-serif' || value === 'mono') {
    return value;
  }
  return DEFAULT_TEMPLATE_SETTINGS.fontSize.headerFont;
}

function parseBodyFont(value: string | undefined): BodyFontFamily {
  if (value === 'serif' || value === 'sans-serif' || value === 'mono') {
    return value;
  }
  return DEFAULT_TEMPLATE_SETTINGS.fontSize.bodyFont;
}

function parseAccentColor(value: string | undefined): AccentColor {
  if (value === 'blue' || value === 'green' || value === 'orange' || value === 'red') {
    return value;
  }
  return DEFAULT_TEMPLATE_SETTINGS.accentColor;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

function parseSpacingLevel(value: string | undefined, defaultValue: SpacingLevel): SpacingLevel {
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num < 1 || num > 5) return defaultValue;
  return num as SpacingLevel;
}

function parseMargin(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return defaultValue;
  return Math.max(5, Math.min(25, num));
}

function parseTemplate(value: string | undefined): TemplateType {
  if (
    value === 'swiss-single' ||
    value === 'swiss-two-column' ||
    value === 'modern' ||
    value === 'modern-two-column'
  ) {
    return value;
  }
  return 'swiss-single';
}

function parsePageSize(value: string | undefined): PageSize {
  if (value === 'A4' || value === 'LETTER') {
    return value;
  }
  return 'A4';
}

export function buildResumePrintSettings(searchParams?: ResumePrintSearchParams): TemplateSettings {
  return {
    template: parseTemplate(searchParams?.template),
    pageSize: parsePageSize(searchParams?.pageSize),
    margins: {
      top: parseMargin(searchParams?.marginTop, DEFAULT_TEMPLATE_SETTINGS.margins.top),
      bottom: parseMargin(searchParams?.marginBottom, DEFAULT_TEMPLATE_SETTINGS.margins.bottom),
      left: parseMargin(searchParams?.marginLeft, DEFAULT_TEMPLATE_SETTINGS.margins.left),
      right: parseMargin(searchParams?.marginRight, DEFAULT_TEMPLATE_SETTINGS.margins.right),
    },
    spacing: {
      section: parseSpacingLevel(
        searchParams?.sectionSpacing,
        DEFAULT_TEMPLATE_SETTINGS.spacing.section
      ),
      item: parseSpacingLevel(searchParams?.itemSpacing, DEFAULT_TEMPLATE_SETTINGS.spacing.item),
      lineHeight: parseSpacingLevel(
        searchParams?.lineHeight,
        DEFAULT_TEMPLATE_SETTINGS.spacing.lineHeight
      ),
    },
    fontSize: {
      base: parseSpacingLevel(searchParams?.fontSize, DEFAULT_TEMPLATE_SETTINGS.fontSize.base),
      headerScale: parseSpacingLevel(
        searchParams?.headerScale,
        DEFAULT_TEMPLATE_SETTINGS.fontSize.headerScale
      ),
      headerFont: parseHeaderFont(searchParams?.headerFont),
      bodyFont: parseBodyFont(searchParams?.bodyFont),
    },
    compactMode: parseBoolean(searchParams?.compactMode, DEFAULT_TEMPLATE_SETTINGS.compactMode),
    showContactIcons: parseBoolean(
      searchParams?.showContactIcons,
      DEFAULT_TEMPLATE_SETTINGS.showContactIcons
    ),
    accentColor: parseAccentColor(searchParams?.accentColor),
  };
}

interface ResumePrintDocumentProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
  additionalSectionLabels: Partial<AdditionalSectionLabels>;
  sectionHeadings: Partial<ResumeSectionHeadings>;
  fallbackLabels: Partial<ResumeFallbackLabels>;
}

export function ResumePrintDocument({
  resumeData,
  settings,
  additionalSectionLabels,
  sectionHeadings,
  fallbackLabels,
}: ResumePrintDocumentProps) {
  const printSettings: TemplateSettings = {
    ...settings,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  };

  const pageDims = PAGE_DIMENSIONS[settings.pageSize];
  const contentWidthMm = pageDims.width - settings.margins.left - settings.margins.right;

  return (
    <div className="resume-print bg-white mx-auto" style={{ width: `${contentWidthMm}mm` }}>
      <Resume
        resumeData={resumeData}
        template={settings.template}
        settings={printSettings}
        additionalSectionLabels={additionalSectionLabels}
        sectionHeadings={sectionHeadings}
        fallbackLabels={fallbackLabels}
      />
    </div>
  );
}
