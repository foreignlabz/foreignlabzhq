'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {Media, Snapshot} from '@/lib/types';
import {canEditPost} from '@/lib/validation';
import {registerDemoMediaUrl, unregisterDemoMediaUrl} from '@/lib/demo-media';
import {HQIcon} from './workspace-icons';
import './workspace-media.css';

type Asset = {id: string; name: string; url?: string; path?: string; mimeType: string; size: number; source: 'local' | 'existing' | 'drive'};
type Association = {asset_id: string; post_id: string};
type Upload = {file: File; id: string; ticket: string; offset: number; chunkBytes: number};
type Props = {data: Snapshot; mode: 'demo' | 'production'; onAttach?: (postId: string, media: Media | null) => Promise<boolean>; busy?: boolean; getAccessToken?: () => Promise<string | null>};
const localAssets = new Map<string, Asset>();
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']);
const sizeLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function WorkspaceMedia({data, mode, onAttach, busy = false, getAccessToken}: Props) {
  const [assets, setAssets] = useState<Asset[]>(() => mode === 'demo' ? [...localAssets.values()] : []);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [postId, setPostId] = useState('');
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState('');
  const upload = useRef<Upload | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  const transient = useRef<string[]>([]);
  const writable = ['owner', 'manager', 'collaborator'].includes(data.member.role);

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getAccessToken?.();
    if (!token) throw new Error('A verified workspace session is required.');
    const response = await fetch(path, {...options, cache: 'no-store', headers: {...options.headers, Authorization: `Bearer ${token}`}});
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'The media request failed.'); }
    return response;
  }, [getAccessToken]);
  const refresh = useCallback(async () => {
    if (mode !== 'production') return;
    const response = await request('/api/drive/'); const body = await response.json();
    if (!active.current) return;
    setAssets(body.assets.map((asset: {id: string; name: string; mime_type: string; size_bytes: number}) => ({id: asset.id, name: asset.name, mimeType: asset.mime_type, size: Number(asset.size_bytes), source: 'drive'})));
    setAssociations(body.associations); setConnected(true);
  }, [mode, request]);
  useEffect(() => { active.current = true; const urls = transient.current; void refresh().catch(e => { if (active.current) setError(e.message); }); return () => { active.current = false; controller.current?.abort(); for (const url of urls) URL.revokeObjectURL(url); }; }, [refresh]);

  const existing: Asset[] = data.posts.filter(post => post.media && !assets.some(asset => asset.url === post.media?.url)).map(post => ({id: `post-${post.id}`, name: post.media!.name, url: post.media!.url, path: post.media!.path, mimeType: post.media!.type === 'video' ? 'video/mp4' : 'image/jpeg', size: 0, source: 'existing'}));
  const all = [...assets, ...existing].filter((asset, index, list) => list.findIndex(item => (item.url && item.url === asset.url) || item.id === asset.id) === index);
  const current = all.find(asset => asset.id === selected);
  const filtered = all.filter(asset => asset.name.toLowerCase().includes(query.toLowerCase()));
  const editablePosts = data.posts.filter(post => canEditPost(post, data.member.role));
  const associatedPosts = current ? data.posts.filter(post => (current.url && post.media?.url === current.url) || associations.some(item => item.asset_id === current.id && item.post_id === post.id)) : [];

  async function runUpload(resume = false) {
    const pending = upload.current; if (!pending) return;
    setWorking(true); setUploading(true); setError(''); controller.current = new AbortController();
    try {
      if (resume) {
        const response = await request(`/api/drive/uploads/${pending.id}/`, {method: 'PUT', headers: {'X-HQ-Upload-Token': pending.ticket, 'X-HQ-Upload-Status': '1'}, signal: controller.current.signal});
        const status = await response.json(); pending.offset = status.offset;
      }
      while (pending.offset < pending.file.size) {
        const end = Math.min(pending.offset + pending.chunkBytes, pending.file.size);
        const response = await request(`/api/drive/uploads/${pending.id}/`, {method: 'PUT', headers: {'X-HQ-Upload-Token': pending.ticket, 'Content-Type': pending.file.type, 'Content-Range': `bytes ${pending.offset}-${end - 1}/${pending.file.size}`}, body: pending.file.slice(pending.offset, end), signal: controller.current.signal});
        const result = await response.json();
        if (!Number.isSafeInteger(result.offset) || result.offset <= pending.offset || result.offset > pending.file.size) throw new Error('Drive did not confirm upload progress. Resume to recover.');
        pending.offset = result.offset; if (active.current) setProgress(Math.round(100 * pending.offset / pending.file.size));
      }
      upload.current = null; setPendingUpload(false); await refresh(); if (active.current) setNotice('Original uploaded privately to Google Drive. Select it to attach to a post.');
    } catch (e) { if (active.current) setError(e instanceof Error && e.name === 'AbortError' ? 'Upload paused. Resume while this screen remains open.' : e instanceof Error ? e.message : 'Upload interrupted.'); }
    finally { if (active.current) { setWorking(false); setUploading(false); } }
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length || !writable || working) return;
    setError(''); setNotice('');
    for (const file of files) {
      if (!allowed.has(file.type) || file.size <= 0 || file.size > 5 * 1024 ** 3) { setError('Choose JPG, PNG, WebP, MP4, or WebM files up to 5 GiB.'); return; }
    }
    if (mode === 'demo') {
      const added = Array.from(files).map(file => ({id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file), mimeType: file.type, size: file.size, source: 'local' as const}));
      for (const asset of added) { localAssets.set(asset.id, asset); registerDemoMediaUrl(asset.url); }
      setAssets([...localAssets.values()]); setSelected(added[0].id); setNotice(`${added.length} file${added.length === 1 ? '' : 's'} added to this browser session. Nothing was uploaded to Drive.`); return;
    }
    if (files.length !== 1) { setError('Upload one original at a time so interrupted uploads can resume.'); return; }
    setWorking(true);
    try {
      const file = files[0]; const response = await request('/api/drive/uploads/', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: file.name, mimeType: file.type, size: file.size})});
      upload.current = {...await response.json(), file, offset: 0}; setPendingUpload(true); setProgress(0); await runUpload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload could not start.'); setWorking(false); }
  }
  async function preview(asset: Asset, download = false) {
    setSelected(asset.id); setPostId(''); setError('');
    if (asset.source !== 'drive' || asset.url) {
      if (download && asset.url) { const link = document.createElement('a'); link.href = asset.url; link.download = asset.name; link.rel = 'noopener'; link.click(); } return;
    }
    setWorking(true);
    try {
      const response = await request(`/api/drive/files/${asset.id}/${download ? '?download=1' : ''}`); const url = URL.createObjectURL(await response.blob()); transient.current.push(url);
      if (download) { const link = document.createElement('a'); link.href = url; link.download = asset.name; link.click(); }
      else setAssets(previous => previous.map(item => item.id === asset.id ? {...item, url} : item));
    } catch (e) { setError(e instanceof Error ? e.message : 'Preview is unavailable.'); }
    finally { setWorking(false); }
  }
  async function attach(removeFrom?: string) {
    if (!current || !writable || !(removeFrom || postId)) return;
    setWorking(true); setError('');
    try {
      if (current.source === 'drive') {
        await request('/api/drive/associations/', {method: removeFrom ? 'DELETE' : 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({assetId: current.id, postId: removeFrom || postId})}); await refresh();
      } else {
        if (!onAttach) throw new Error('Post attachment editing is not available.');
        const ok = await onAttach(removeFrom || postId, removeFrom ? null : {url: current.url!, path: current.path, name: current.name, type: current.mimeType.startsWith('video/') ? 'video' : 'image'});
        if (!ok) throw new Error('The attachment was not saved. Check the post permissions.');
      }
      setNotice(removeFrom ? 'Attachment removed from the post. The original file is preserved.' : 'File attached to the post.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The attachment could not be updated.'); }
    finally { setWorking(false); }
  }
  function removeLocal() {
    if (!writable || working || busy || !current || current.source !== 'local' || associatedPosts.length) return;
    URL.revokeObjectURL(current.url!); unregisterDemoMediaUrl(current.url!); localAssets.delete(current.id); setAssets([...localAssets.values()]); setSelected(null); setNotice('Removed the browser copy. No original file was deleted.');
  }

  return <section className="wm-library" aria-label="Media Library">
    <div className="wm-toolbar"><div><span className="wm-eyebrow">YOUR CREATIVE MATERIAL</span><h2>Every detail, in one place.</h2><p>{mode === 'demo' ? 'A session-only library to explore your next idea.' : 'Private originals. Connected to your content.'}</p></div><label className={`wm-upload ${!writable || working || (mode === 'production' && !connected) ? 'wm-disabled' : ''}`}><span aria-hidden="true">＋</span> Add media<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple={mode === 'demo'} disabled={!writable || working || (mode === 'production' && !connected)} onChange={e => {void addFiles(e.target.files); e.target.value = '';}}/></label></div>
    <div className="wm-status"><span className={`wm-indicator ${connected ? 'wm-connected' : ''}`}/><strong>{mode === 'demo' ? 'Local preview' : connected ? 'Private Drive library' : 'Google Drive not connected'}</strong><span>{mode === 'demo' ? 'Files stay in this browser session · originals unchanged' : 'Access follows your workspace permissions'}</span></div>
    {notice && <p className="wm-notice" role="status">{notice}</p>}{error && <p className="wm-error" role="alert">{error}</p>}
    {pendingUpload && <div className="wm-upload-progress"><progress value={progress} max={100} aria-label="Upload progress"/><span>{progress}%</span>{uploading ? <button onClick={() => controller.current?.abort()}>Pause upload</button> : <button onClick={() => void runUpload(true)}>Resume upload</button>}</div>}
    <div className="wm-filter"><label><span className="wm-sr-only">Search media</span><input type="search" placeholder="Search your media…" value={query} onChange={e => setQuery(e.target.value)}/></label><span>{filtered.length} {filtered.length === 1 ? 'asset' : 'assets'}</span>{!writable && <span>Read-only access</span>}</div>
    <div className="wm-layout"><div className="wm-grid">{filtered.map(asset => <button key={asset.id} className={`wm-card ${selected === asset.id ? 'wm-selected' : ''}`} onClick={() => void preview(asset)} aria-pressed={selected === asset.id}><div className="wm-thumb">{asset.url ? asset.mimeType.startsWith('video/') ? <><video src={asset.url} muted preload="metadata"/><span className="wm-play" aria-hidden="true">▷</span></> : <img src={asset.url} alt="" loading="lazy"/> : <span className="wm-file-symbol" aria-hidden="true">{asset.mimeType.startsWith('video/') ? '▷' : '▧'}</span>}<span className="wm-type">{asset.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE'}</span></div><strong>{asset.name}</strong><small>{asset.size ? sizeLabel(asset.size) : 'Post attachment'} · {asset.source === 'drive' ? 'Private Drive' : asset.source === 'local' ? 'Local session' : 'From calendar'}</small></button>)}{!filtered.length && <div className="wm-empty"><span aria-hidden="true">▧</span><h3>{query ? 'No matching media' : 'Make room for your next idea.'}</h3><p>{query ? 'Try a different filename.' : writable ? 'Add photos or videos, then attach them to your content calendar.' : 'Your team’s media will appear here.'}</p></div>}</div>
      <aside className="wm-detail" aria-label="Media details">{current ? <><span className="wm-eyebrow">SELECTED ORIGINAL</span><h3>{current.name}</h3>{current.url && <div className="wm-selected-preview">{current.mimeType.startsWith('video/') ? <video src={current.url} controls playsInline preload="metadata"/> : <img src={current.url} alt={current.name}/>}</div>}<dl><div><dt>Format</dt><dd>{current.mimeType.split('/')[1].toUpperCase()}</dd></div><div><dt>Location</dt><dd>{current.source === 'drive' ? 'Google Drive · private' : current.source === 'local' ? 'This browser session' : 'Post attachment'}</dd></div>{current.size > 0 && <div><dt>Size</dt><dd>{sizeLabel(current.size)}</dd></div>}</dl><button className="wm-secondary" disabled={working} onClick={() => void preview(current, true)}>Download original ↓</button><h4>Attached to</h4>{associatedPosts.length ? <ul>{associatedPosts.map(post => <li key={post.id}><span>{post.title}</span>{writable && canEditPost(post, data.member.role) && <button disabled={working || busy} onClick={() => void attach(post.id)} aria-label={`Remove attachment from ${post.title}`}>Unlink</button>}</li>)}</ul> : <p className="wm-muted">Not attached to a post yet.</p>}{writable && <><label className="wm-post-picker">Attach to a post<select value={postId} onChange={e => setPostId(e.target.value)}><option value="">Choose a post</option>{editablePosts.map(post => <option key={post.id} value={post.id}>{post.title}</option>)}</select></label><button className="wm-secondary" disabled={!postId || working || busy} onClick={() => void attach()}>Attach to post <HQIcon name="arrow" size={14}/></button></>}{current.source === 'local' && writable && <button className="wm-remove" disabled={associatedPosts.length > 0 || working || busy} onClick={removeLocal}>Remove browser copy</button>}<p className="wm-footnote">Unlinking keeps the original. {current.source === 'local' ? 'Local files and their previews expire when this browser session ends.' : 'Private files are never made public.'}</p></> : <><span className="wm-eyebrow">A HOME FOR THE ORIGINALS</span><div className="wm-library-art" aria-hidden="true"><HQIcon name="arrow" size={60}/></div><h3>Made to be seen.<br/>Kept in your hands.</h3><p>Select an asset to preview, download, or connect it to a post.</p><div className="wm-rule"/><p className="wm-footnote">{mode === 'demo' ? 'Demo files never leave your browser. Large originals are supported without a 25 MiB demo limit.' : 'Secure Drive uploads use resumable chunks. The connection must be configured before uploading.'}</p></>}</aside>
    </div>
  </section>;
}
