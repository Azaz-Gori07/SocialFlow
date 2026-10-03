import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const XIcon: React.FC<IconProps> = ({ size = 16, style, className }) => (
  <img 
    src="/icons/x.png" 
    alt="X (Twitter)" 
    width={size} 
    height={size} 
    style={{ 
      width: `${size}px`, 
      height: `${size}px`, 
      borderRadius: '4px', 
      objectFit: 'contain', 
      display: 'inline-block', 
      verticalAlign: 'middle', 
      ...style 
    }} 
    className={className} 
  />
);

export const LinkedInIcon: React.FC<IconProps> = ({ size = 16, style, className }) => (
  <img 
    src="/icons/linkedin.png" 
    alt="LinkedIn" 
    width={size} 
    height={size} 
    style={{ 
      width: `${size}px`, 
      height: `${size}px`, 
      borderRadius: '4px', 
      objectFit: 'contain', 
      display: 'inline-block', 
      verticalAlign: 'middle', 
      ...style 
    }} 
    className={className} 
  />
);

export const InstagramIcon: React.FC<IconProps> = ({ size = 16, style, className }) => (
  <img 
    src="/icons/instagram.png" 
    alt="Instagram" 
    width={size} 
    height={size} 
    style={{ 
      width: `${size}px`, 
      height: `${size}px`, 
      borderRadius: '4px', 
      objectFit: 'contain', 
      display: 'inline-block', 
      verticalAlign: 'middle', 
      ...style 
    }} 
    className={className} 
  />
);

export const ThreadsIcon: React.FC<IconProps> = ({ size = 16, style, className }) => (
  <img 
    src="/icons/threads.png" 
    alt="Threads" 
    width={size} 
    height={size} 
    style={{ 
      width: `${size}px`, 
      height: `${size}px`, 
      borderRadius: '50%', 
      objectFit: 'contain', 
      display: 'inline-block', 
      verticalAlign: 'middle', 
      ...style 
    }} 
    className={className} 
  />
);

export const YouTubeIcon: React.FC<IconProps> = ({ size = 16, style, className }) => (
  <img 
    src="/icons/youtube.png" 
    alt="YouTube" 
    width={size} 
    height={size} 
    style={{ 
      width: `${size}px`, 
      height: `${size}px`, 
      borderRadius: '4px', 
      objectFit: 'contain', 
      display: 'inline-block', 
      verticalAlign: 'middle', 
      ...style 
    }} 
    className={className} 
  />
);

export const FacebookIcon: React.FC<IconProps> = ({ size = 16, style, className }) => (
  <img 
    src="/icons/facebook.png" 
    alt="Facebook" 
    width={size} 
    height={size} 
    style={{ 
      width: `${size}px`, 
      height: `${size}px`, 
      borderRadius: '4px', 
      objectFit: 'contain', 
      display: 'inline-block', 
      verticalAlign: 'middle', 
      ...style 
    }} 
    className={className} 
  />
);

export const PlatformBadge: React.FC<{ 
  platform: string; 
  size?: number; 
  className?: string; 
  style?: React.CSSProperties;
  iconSize?: number;
}> = ({ 
  platform, 
  size = 32,
  className,
  style
}) => {
  const p = platform.toLowerCase();
  let src = '/icons/x.png';
  if (p === 'linkedin') src = '/icons/linkedin.png';
  else if (p === 'instagram') src = '/icons/instagram.png';
  else if (p === 'threads') src = '/icons/threads.png';
  else if (p === 'youtube') src = '/icons/youtube.png';
  else if (p === 'facebook') src = '/icons/facebook.png';
  else if (p === 'twitter' || p === 'x') src = '/icons/x.png';

  return (
    <img 
      src={src} 
      alt={platform} 
      width={size} 
      height={size}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: p === 'threads' ? '50%' : '8px',
        objectFit: 'contain',
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style
      }}
      className={className}
    />
  );
};
