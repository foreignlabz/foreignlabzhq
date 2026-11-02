export type PrivateDriveAsset = {id: string; name: string; mimeType: string; size: number};
export type DriveAccessToken = () => Promise<string | null>;
type Options = {mode: 'demo' | 'production'; getAccessToken?: DriveAccessToken; signal?: AbortSignal; fetcher?: typeof fetch};

async function privateRequest(path: string, options: Options) {
  if (options.mode !== 'production') throw new Error('Drive is unavailable in the demo workspace.');
  const token = await options.getAccessToken?.();
  if (!token) throw new Error('A verified workspace session is required.');
  const response = await (options.fetcher ?? fetch)(path, {headers: {Authorization: `Bearer ${token}`}, credentials: 'same-origin', cache: 'no-store', signal: options.signal});
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Private Drive media is unavailable.');
  }
  return response;
}
export async function loadPostDriveAssets(postId: string, options: Options): Promise<PrivateDriveAsset[]> {
  if (options.mode === 'demo') return [];
  const response = await privateRequest('/api/drive/', options);
  const body = await response.json();
  if (!Array.isArray(body.assets) || !Array.isArray(body.associations)) throw new Error('The private media response was invalid.');
  const ids = new Set(body.associations.filter((item: {post_id?: string}) => item.post_id === postId).map((item: {asset_id?: string}) => item.asset_id));
  return body.assets.filter((item: {id?: string}) => ids.has(item.id)).map((item: {id: string; name: string; mime_type: string; size_bytes: number}) => {
    if (!/^[0-9a-f-]{36}$/i.test(item.id) || typeof item.name !== 'string' || !['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(item.mime_type) || !Number.isFinite(Number(item.size_bytes))) throw new Error('The private media response was invalid.');
    return {id: item.id, name: item.name, mimeType: item.mime_type, size: Number(item.size_bytes)};
  });
}
export async function fetchPrivateDriveAsset(assetId: string, options: Options, download = false): Promise<Blob> {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new Error('Invalid private media identifier.');
  const response = await privateRequest(`/api/drive/files/${assetId}/${download ? '?download=1' : ''}`, options);
  return response.blob();
}
