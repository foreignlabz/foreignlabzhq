'use client';

import {useEffect, useRef, useState} from 'react';
import {fetchPrivateDriveAsset, loadPostDriveAssets, type DriveAccessToken, type PrivateDriveAsset} from '@/lib/drive/client';
import './drive-post-media.css';

type Props = {postId: string; mode: 'demo' | 'production'; getAccessToken?: DriveAccessToken; enabled?: boolean};
export default function DrivePostMedia({postId, mode, getAccessToken, enabled = true}: Props) {
  const [assets, setAssets] = useState<PrivateDriveAsset[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const live = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const objectURLs = useRef(new Set<string>());
  useEffect(() => {
    live.current = true;
    const urlsToRevoke = objectURLs.current;
    return () => { live.current = false; controller.current?.abort(); for (const url of urlsToRevoke) URL.revokeObjectURL(url); urlsToRevoke.clear(); };
  }, []);

  if (mode !== 'production' || !enabled) return null;

  async function load() {
    if (busy) return;
    setBusy('list'); setError(''); controller.current = new AbortController();
    try {
      const result = await loadPostDriveAssets(postId, {mode, getAccessToken, signal: controller.current.signal});
      if (live.current) { setAssets(result); setLoaded(true); }
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : 'Private attachments could not be loaded.'); }
    finally { if (live.current) setBusy(null); }
  }
  async function open(asset: PrivateDriveAsset, download: boolean) {
    if (busy) return;
    setBusy(asset.id); setError(''); controller.current = new AbortController();
    try {
      let url = urls[asset.id];
      if (!url) {
        const blob = await fetchPrivateDriveAsset(asset.id, {mode, getAccessToken, signal: controller.current.signal}, download);
        if (!live.current) return;
        url = URL.createObjectURL(blob); objectURLs.current.add(url);
        setUrls(previous => ({...previous, [asset.id]: url}));
      }
      if (download) { const link = document.createElement('a'); link.href = url; link.download = asset.name; link.rel = 'noopener'; link.click(); }
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : 'Private media could not be opened.'); }
    finally { if (live.current) setBusy(null); }
  }
  return <section className="dpm-section" aria-label="Private Drive attachments">
    <div className="dpm-heading"><div><span className="dpm-eyebrow">PRIVATE ORIGINALS</span><h3>Attached from Drive</h3></div><button type="button" disabled={Boolean(busy)} onClick={() => void load()}>{busy === 'list' ? 'Loading…' : loaded ? 'Refresh' : 'View attachments'}</button></div>
    {!loaded && !error && <p>Load this post’s originals securely. Files remain private.</p>}
    {error && <p className="dpm-error" role="alert">{error}</p>}
    {loaded && !assets.length && <p>No Drive originals are attached to this post.</p>}
    <div className="dpm-list">{assets.map(asset => <article key={asset.id} className="dpm-asset"><div className="dpm-file"><span aria-hidden="true">{asset.mimeType.startsWith('video/') ? '▷' : '▧'}</span><div><strong>{asset.name}</strong><small>{(asset.size / 1024 / 1024).toFixed(1)} MB · Private Google Drive</small></div></div><div className="dpm-actions"><button type="button" disabled={Boolean(busy)} onClick={() => void open(asset, false)}>{busy === asset.id ? 'Loading…' : urls[asset.id] ? 'Preview loaded' : 'Preview original'}</button><button type="button" disabled={Boolean(busy)} onClick={() => void open(asset, true)}>Download ↓</button></div>{urls[asset.id] && <div className="dpm-preview">{asset.mimeType.startsWith('video/') ? <video src={urls[asset.id]} controls playsInline preload="metadata" aria-label={asset.name}/> : <img src={urls[asset.id]} alt={asset.name}/>}</div>}</article>)}</div>
    {loaded && assets.length > 0 && <p className="dpm-note">Manage attachments in the Media Library. Unlinking preserves the original. Large previews load the original into this browser tab.</p>}
  </section>;
}
