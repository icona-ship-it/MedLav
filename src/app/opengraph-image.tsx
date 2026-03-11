import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'MedLav - Report medico-legali automatici';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #dbeafe 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Scale icon (SVG) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
            <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
            <path d="M7 21h10" />
            <path d="M12 3v18" />
            <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '-0.02em',
            marginBottom: 16,
          }}
        >
          MedLav
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 32,
            fontWeight: 400,
            color: 'rgba(255, 255, 255, 0.9)',
            marginBottom: 12,
          }}
        >
          Report medico-legali automatici
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 300,
            color: 'rgba(255, 255, 255, 0.7)',
            padding: '8px 24px',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            marginTop: 8,
          }}
        >
          AI per medici legali
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
