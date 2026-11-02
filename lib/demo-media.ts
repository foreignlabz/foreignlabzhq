// Blob URLs are valid only in the browser session that created them. This
// registry deliberately contains no credentials and is never persisted.
const activeUrls=new Set<string>();

export function registerDemoMediaUrl(url:string):void {
  if(url.startsWith('blob:'))activeUrls.add(url);
}

export function unregisterDemoMediaUrl(url:string):void {
  activeUrls.delete(url);
}

export function isDemoMediaUrlActive(url:string):boolean {
  return activeUrls.has(url);
}
