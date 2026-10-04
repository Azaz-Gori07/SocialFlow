import React, { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';

const WORD = 'SocialFlow';

/**
 * App boot curtain. Plays once per page load over the already-rendered app,
 * then wipes upward (clip-path) to reveal it.
 *
 * It never waits on the network: `ready` flips once auth state has hydrated
 * from localStorage, and a hard 4s ceiling guarantees the curtain lifts even
 * if that never happens — a stuck loading screen is the failure this exists
 * to prevent.
 */
export const BootScreen: React.FC<{ ready: boolean; onDone: () => void }> = ({ ready, onDone }) => {
  const [leaving, setLeaving] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (leaving) return;
    const elapsed = Date.now() - startedAt.current;
    const wait = Math.max(0, 1100 - elapsed);
    const t = setTimeout(() => setLeaving(true), ready ? wait : 4000);
    return () => clearTimeout(t);
  }, [ready, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, 700); // covers the 640ms wipe
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  return (
    <div
      className={`boot-screen${leaving ? ' is-out' : ''}`}
      aria-hidden="true"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      <div className="boot-inner">
        <div
          className="boot-mark"
          style={{
            width: 48,
            height: 48,
            borderRadius: 13,
            background: '#18181b',
            boxShadow: '0 10px 26px rgba(24, 24, 27, 0.22)'
          }}
        >
          <Layers size={23} color="#ffffff" strokeWidth={2.1} />
        </div>

        <div className="boot-word">
          {WORD.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${140 + i * 26}ms` }}>
              {ch}
            </span>
          ))}
        </div>

        <div className="boot-track">
          <div className="boot-fill" />
        </div>
      </div>
    </div>
  );
};

export default BootScreen;
