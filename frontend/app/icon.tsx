import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#dc2626',
          borderRadius: '6px',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 900,
          fontSize: 20,
          fontFamily: 'sans-serif',
          letterSpacing: '-1px',
        }}
      >
        A
      </div>
    ),
    { ...size },
  );
}
