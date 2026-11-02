'use client';

/* Direct media URLs preserve existing private-media delivery; no external image proxy. */
import {useEffect, useMemo, useRef, useState} from 'react';
import {buildFeedPreview, FEED_ACCOUNTS, findFeedAccount, type FeedMode, type FeedTile} from '@/lib/feed-preview';
import {formatDate} from '@/lib/dates';
import type {Snapshot} from '@/lib/types';
import {HQIcon} from './workspace-icons';
import './workspace-feed.css';

type Props = {
  data: Snapshot;
  onSelectPost: (id: string) => void;
  canEdit: boolean;
  onNewPost: () => void;
};

function GridIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16"/></svg>;
}

function HistoricalDialog({tile, onDismiss}: {tile: FeedTile; onDismiss: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); opener?.focus(); };
  }, []);
  return <dialog ref={ref} className="hq-feed-dialog" aria-labelledby="feed-image-title" onCancel={onDismiss} onClick={event => {if (event.target === event.currentTarget) onDismiss();}}>
    <div className="hq-feed-dialog-content">
      <button type="button" className="hq-feed-close" aria-label="Close screenshot reference" onClick={onDismiss} autoFocus>×</button>
      {tile.src && <img src={tile.src} alt={tile.title}/>}
      <div><span className="hq-feed-eyebrow">RECOVERED REFERENCE</span><h3 id="feed-image-title">A moment in the feed.</h3><p>{tile.title}. This low-resolution crop comes from the supplied source archive. It is not a live Instagram post or an original publishing asset.</p></div>
    </div>
  </dialog>;
}

function Thumbnail({tile}: {tile: FeedTile}) {
  const [failed, setFailed] = useState(false);
  if (!tile.src || failed) return <span className="hq-feed-art"><span>4EIGN / IN THE MAKING</span><strong>{tile.title}</strong><small>{failed ? 'Preview unavailable' : 'Artwork to come'}</small></span>;
  return tile.mediaType === 'video'
    ? <><video src={tile.src} muted playsInline preload="metadata" onError={() => setFailed(true)} aria-label={`Video thumbnail: ${tile.title}`}/><span className="hq-feed-video" aria-hidden="true">▷</span></>
    : <img src={tile.src} alt={tile.title} loading="lazy" onError={() => setFailed(true)}/>;
}

export default function WorkspaceFeed({data, onSelectPost, canEdit, onNewPost}: Props) {
  const [handle, setHandle] = useState<string>(FEED_ACCOUNTS[0].handle);
  const [mode, setMode] = useState<FeedMode>('future');
  const [selected, setSelected] = useState<FeedTile | null>(null);
  const account = findFeedAccount(data.accounts, handle);
  const profile = FEED_ACCOUNTS.find(item => item.handle === handle)!;
  const tiles = useMemo(() => buildFeedPreview(data.posts, account, handle, mode), [data.posts, account, handle, mode]);
  const planned = tiles.filter(tile => tile.kind === 'planned');
  const screenshotCount = tiles.length - planned.length;

  return <section className="hq-feed" aria-label="Feed Preview workspace">
    <div className="hq-feed-controls">
      <div className="hq-feed-account-control"><label htmlFor="hq-feed-account">YOUR ACCOUNT</label><select id="hq-feed-account" value={handle} onChange={event => {setHandle(event.target.value); setSelected(null);}}>{FEED_ACCOUNTS.map(item => <option key={item.handle} value={item.handle}>{item.handle}</option>)}</select></div>
      <div className="hq-feed-segment" role="group" aria-label="Feed view">{(['current', 'future'] as const).map(view => <button type="button" key={view} aria-pressed={mode === view} onClick={() => setMode(view)}>{view === 'current' ? 'Current Feed' : 'Future Feed'}</button>)}</div>
      {canEdit && <button type="button" className="hq-feed-add" onClick={onNewPost}><span aria-hidden="true">＋</span> Plan a post</button>}
    </div>

    <div className="hq-feed-layout">
      <div className="hq-feed-profile">
        <div className="hq-feed-profile-top"><div className={`hq-feed-avatar ${handle === '@dragonballhuntpr' ? 'hq-feed-avatar-orange' : ''}`} aria-hidden="true">{profile.initials}</div><div><h2>{handle}</h2><p>{profile.name}</p></div><span className="hq-feed-preview-label">PREVIEW</span></div>
        <div className="hq-feed-profile-bio"><strong>{handle === '@4eignlabz' ? 'A different point of view.' : 'The next chapter starts here.'}</strong><p>{handle === '@4eignlabz' ? 'The details. The process. The things we make our own.' : 'Plan the moments that bring your community together.'}</p></div>
        <div className="hq-feed-grid-heading"><span><GridIcon/> {mode === 'future' ? 'YOUR FUTURE GRID' : 'CURRENT SNAPSHOT'}</span><span>{tiles.length} {tiles.length === 1 ? 'tile' : 'tiles'}</span></div>
        <div className="hq-feed-grid" aria-label={`${profile.handle} ${mode} feed, three-column grid`}>
          {tiles.map(tile => <button type="button" key={tile.id} className={`hq-feed-tile ${tile.kind === 'planned' ? 'hq-feed-tile-planned' : ''}`} onClick={() => tile.post ? onSelectPost(tile.post.id) : setSelected(tile)} aria-label={`${tile.kind === 'planned' ? 'Planned post' : 'Screenshot reference'}: ${tile.title}${tile.collaborative ? ', collaborative post' : ''}`}>
            <Thumbnail key={`${tile.id}-${tile.src ?? ''}`} tile={tile}/>
            {tile.kind === 'planned' && <span className="hq-feed-tile-tag">{tile.collaborative ? 'COLLAB' : 'PLANNED'}</span>}
            <span className="hq-feed-tile-caption"><strong>{tile.title}</strong>{tile.post && <small>{formatDate(tile.post.scheduledAt, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}</small>}</span>
          </button>)}
        </div>
        {!tiles.length && <div className="hq-feed-empty"><GridIcon/><h3>A fresh perspective.</h3><p>{mode === 'current' ? 'No current-feed screenshots were supplied for this account.' : 'No scheduled posts or current-feed screenshots for this account yet.'}</p>{mode === 'future' && canEdit && <button type="button" className="hq-feed-add" onClick={onNewPost}>Plan the first post</button>}</div>}
        <p className="hq-feed-source-caption">{screenshotCount ? '12 screenshot references · Original order preserved · Not live Instagram data' : 'No current-feed snapshot available'}</p>
      </div>

      <aside className="hq-feed-insights" aria-label="Feed planning details">
        <section className="hq-feed-note-card"><span className="hq-feed-eyebrow">SEE THE BIG PICTURE</span><h3>Make every<br/><em>square</em> count.</h3><p>Find the rhythm before it goes live. A little room to experiment, a clearer story to tell.</p><div className="hq-feed-stat"><strong>{String(planned.length).padStart(2, '0')}</strong><div>planned {planned.length === 1 ? 'post' : 'posts'}<small>{mode === 'current' ? 'Switch to Future Feed to see your plans' : 'In this account’s future grid'}</small></div></div></section>
        <section className="hq-feed-details-card"><h3>{mode === 'future' ? 'How this comes together' : 'A reference, not a live feed'}</h3><p>{mode === 'future' ? 'Scheduled drafts, reviews, and approved posts appear first, with the latest scheduled time at the top left. The screenshot snapshot follows in its original order.' : 'These crops were recovered from your supplied feed screenshots. Followers, publication counts, and live Instagram activity are not synchronized.'}</p><dl><div><dt>Current feed</dt><dd>{screenshotCount ? 'Screenshot reference' : 'Not supplied'}</dd></div><div><dt>Future feed</dt><dd>Workspace schedule</dd></div><div><dt>Publishing</dt><dd>Manual, always</dd></div></dl>{!account && <p className="hq-feed-notice">This handle is not linked to a workspace account yet. Only available screenshot references are shown.</p>}</section>
        <p className="hq-feed-footnote"><HQIcon name="arrow" size={16}/> Collaborative posts share one record across both account previews. Edits stay in sync.</p>
      </aside>
    </div>
    {selected && <HistoricalDialog tile={selected} onDismiss={() => setSelected(null)}/>}
  </section>;
}
