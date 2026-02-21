import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Resume Matcher — Free AI Resume Tailoring Tool';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          backgroundColor: '#F0F0E8',
          backgroundImage: `
            linear-gradient(rgba(29,78,216,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(29,78,216,0.08) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          fontFamily: 'serif',
        }}
      >
        {/* Outer card */}
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '2px solid #000',
            backgroundColor: '#fff',
            boxShadow: '10px 10px 0px 0px rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Blue top accent */}
          <div style={{ height: '6px', backgroundColor: '#1D4ED8', flexShrink: 0 }} />

          {/* Content */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
              padding: '48px 56px',
              gap: '48px',
              alignItems: 'center',
            }}
          >
            {/* Left */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '16px' }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#1D4ED8',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                }}
              >
                {'// FREE · AI · NO SUBSCRIPTION'}
              </span>
              <span
                style={{
                  fontFamily: 'serif',
                  fontSize: '72px',
                  fontWeight: 900,
                  color: '#000',
                  lineHeight: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '-0.02em',
                }}
              >
                Resume
                <br />
                Matcher
              </span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '18px',
                  color: '#444',
                  marginTop: '8px',
                }}
              >
                Tailor your CV to any job description
              </span>
            </div>

            {/* Right — feature list */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                borderLeft: '2px solid #000',
                paddingLeft: '48px',
                width: '340px',
                flexShrink: 0,
              }}
            >
              {[
                'AI Resume Tailoring',
                'ATS Keyword Matching',
                'PDF Export',
                'Completely Free',
              ].map((feature) => (
                <div
                  key={feature}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#000',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: '#1D4ED8',
                      flexShrink: 0,
                    }}
                  />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: '1px solid #000',
              padding: '14px 56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F0F0E8',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#1D4ED8',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              resume.bevansatria.my.id
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#888',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              FREE · ATS OPTIMIZED · AI POWERED
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
