import React from 'react';

/** Single shimmering block. Width/height accept any CSS length. */
export const Sk: React.FC<{
  w?: number | string;
  h?: number | string;
  r?: number;
  style?: React.CSSProperties;
}> = ({ w = '100%', h = 14, r = 8, style }) => (
  <span className="sk" style={{ width: w, height: h, borderRadius: r, display: 'block', ...style }} />
);

/**
 * Dashboard placeholder — mirrors the real layout geometry exactly
 * (header, 4 KPI cards, 1.8fr/1.2fr chart row, 3 quick actions) so the
 * swap to real data causes no layout shift.
 */
export const DashboardSkeleton: React.FC = () => (
  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
    {/* Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Sk w={290} h={30} r={8} />
        <Sk w={360} h={14} r={6} />
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <Sk w={132} h={40} r={10} />
        <Sk w={104} h={40} r={10} />
      </div>
    </div>

    {/* KPI row */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sk w={28} h={28} r={8} />
            <Sk w={112} h={12} r={6} />
          </div>
          <Sk w={124} h={26} r={6} />
          <Sk w={76} h={12} r={6} />
        </div>
      ))}
    </div>

    {/* Chart row */}
    <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '20px' }}>
      <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sk w={22} h={22} r={6} />
          <Sk w={156} h={14} r={6} />
        </div>
        <Sk w="100%" h={276} r={12} />
      </div>

      <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sk w={22} h={22} r={6} />
          <Sk w={138} h={14} r={6} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Sk w={32} h={32} r={8} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <Sk w="58%" h={12} r={6} />
              <Sk w="100%" h={8} r={4} />
            </div>
            <Sk w={32} h={12} r={6} />
          </div>
        ))}
      </div>
    </div>

    {/* Quick actions */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Sk w={38} h={38} r={10} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <Sk w={148} h={13} r={6} />
            <Sk w={188} h={11} r={6} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** Shared placeholder for content-heavy pages (analytics, alert rules, dev tools). */
export const GenericSkeleton: React.FC<{ minHeight?: number }> = ({ minHeight = 340 }) => (
  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px', minHeight }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Sk w={248} h={28} r={8} />
        <Sk w={330} h={13} r={6} />
      </div>
      <Sk w={124} h={40} r={10} />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {[0, 1].map((i) => (
        <div key={i} className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Sk w={168} h={14} r={6} />
          <Sk w="100%" h={i === 0 ? 196 : 148} r={12} />
          {[0, 1, 2].map((j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sk w={24} h={24} r={6} />
              <Sk w={`${72 - j * 9}%`} h={11} r={6} />
            </div>
          ))}
        </div>
      ))}
    </div>

    <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Sk w={196} h={14} r={6} />
      {[0, 1, 3].map((j) => (
        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Sk w={28} h={28} r={8} />
          <Sk w="40%" h={12} r={6} />
          <Sk w="22%" h={12} r={6} />
          <Sk w={56} h={24} r={12} />
        </div>
      ))}
    </div>
  </div>
);
