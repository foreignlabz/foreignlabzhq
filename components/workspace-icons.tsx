import type {ReactNode} from 'react';
export function HQIcon({name,size=20}:{name:string;size?:number}) {
  const shapes:Record<string,ReactNode>={
    calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/></>,
    media:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
    grid:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,
    arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,chevron:<path d="m9 5 7 7-7 7"/>,
    lock:<><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
    search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    check:<path d="m5 12 4 4L19 6"/>,copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/></>,
    logout:<><path d="M9 4H4v16h5m5-12 4 4-4 4M9 12h12"/></>,
    spark:<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]??shapes.spark}</svg>;
}
