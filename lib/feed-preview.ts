import {futureFeedPosts, postAccountIds} from './planning';
import type {Account, Post} from './types';

export type FeedMode = 'current' | 'future';
export type FeedTile = {
  id: string;
  kind: 'planned' | 'snapshot';
  title: string;
  src: string | null;
  mediaType: 'image' | 'video';
  post?: Post;
  collaborative: boolean;
};

export const FEED_ACCOUNTS = [
  {handle: '@4eignlabz', name: '4EIGNLABZ', initials: '4L'},
  {handle: '@dragonballhuntpr', name: 'Dragon Ball Hunt PR', initials: 'DB'},
] as const;

export function findFeedAccount(accounts: Account[], handle: string): Account | undefined {
  const normalize = (value: string) => value.trim().replace(/^@/, '').toLowerCase();
  return accounts.find(account => normalize(account.handle) === normalize(handle));
}

/** Screenshot order is preserved; no fixture status is treated as a live Instagram record. */
export function snapshotFeed(handle: string): FeedTile[] {
  if (handle.trim().replace(/^@/, '').toLowerCase() !== '4eignlabz') return [];
  return Array.from({length: 12}, (_, index) => ({
    id: `snapshot-4eignlabz-${index + 1}`,
    kind: 'snapshot' as const,
    title: `4EIGNLABZ screenshot reference ${index + 1}`,
    src: `/feed/4eignlabz/${String(index + 1).padStart(2, '0')}.jpg`,
    mediaType: 'image' as const,
    collaborative: false,
  }));
}

export function buildFeedPreview(posts: Post[], account: Account | undefined, handle: string, mode: FeedMode): FeedTile[] {
  const snapshot = snapshotFeed(handle);
  if (mode === 'current' || !account) return snapshot;
  const planned: FeedTile[] = futureFeedPosts(posts, account.id)
    .filter(post => post.status !== 'published')
    .map(post => ({
      id: post.id,
      kind: 'planned',
      title: post.title,
      src: post.media?.url || null,
      mediaType: post.media?.type ?? 'image',
      post,
      collaborative: postAccountIds(post).length > 1,
    }));
  return [...planned, ...snapshot];
}
