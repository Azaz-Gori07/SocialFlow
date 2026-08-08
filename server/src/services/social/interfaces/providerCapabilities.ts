import { ProviderCapabilities } from './socialProvider.interface';

/** No capabilities at all (nothing granted). */
export const NO_CAPABILITIES: ProviderCapabilities = {
  readProfile: false,
  readPosts: false,
  createPost: false,
  deletePost: false,
  updatePost: false,
  uploadImage: false,
  uploadVideo: false,
  carousel: false,
  stories: false,
  reels: false,
  commentsRead: false,
  commentsWrite: false,
  insights: false,
  messaging: false,
  webhooks: false,
};

export function capabilities(overrides: Partial<ProviderCapabilities>): ProviderCapabilities {
  return { ...NO_CAPABILITIES, ...overrides };
}

/** Media kinds derivable from a capability set. */
export function mediaKinds(caps: ProviderCapabilities): Array<'image' | 'video' | 'text'> {
  const kinds: Array<'image' | 'video' | 'text'> = [];
  if (caps.uploadImage) kinds.push('image');
  if (caps.uploadVideo) kinds.push('video');
  if (caps.createPost) kinds.push('text');
  return kinds;
}
