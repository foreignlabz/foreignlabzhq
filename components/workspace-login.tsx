'use client';

import Link from 'next/link';
import {HQIcon} from './workspace-icons';
import type {AuthIssue} from '@/lib/auth-flow';

type Props={
  busy?:boolean;
  error?:string|null;
  issue?:AuthIssue|null;
  forbidden?:boolean;
  preview?:boolean;
  onGoogle?:()=>void;
  onRetry?:()=>void;
  onSignOut?:()=>void;
};

function GoogleIcon(){return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.7 2.9-4.2 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1a6 6 0 0 1-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-4V7.4H3a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.4L6.4 10A6 6 0 0 1 12 5.9Z"/></svg>;}

export default function WorkspaceLogin({busy=false,error,issue,forbidden=false,preview=false,onGoogle,onRetry,onSignOut}:Props){
  const message=issue?.message??error;
  const retryLoad=issue?.retry==='reload';
  const switchAccount=forbidden||issue?.retry==='switch_account';
  return <main className="hq3 hq3-login">
    <header className="hq3-login-top"><Link href="/" className="hq3-brand">4EIGNLABZ<span>CONTENT HQ / 3.0</span></Link><span className="hq3-private"><HQIcon name="lock" size={13}/> A private creative space</span></header>
    <div className="hq3-login-content">
      <section className="hq3-login-story"><p className="hq3-eyebrow">GOOD IDEAS DESERVE A HOME</p><h1>A little less noise.<br/>A lot more <em>possibility.</em></h1><p>Your people, your process, your next great post.<br/>A shared space for everything you’re creating.</p><div className="hq3-orbit" aria-hidden="true"><div className="hq3-orbit-ring"/><div className="hq3-orbit-card"><span>THE NEXT CHAPTER</span><strong>Make it<br/><em>4eign.</em></strong><div>IDEAS WITHOUT BORDERS <HQIcon name="spark"/></div></div><span className="hq3-orbit-chip"><i/> Room to create.</span></div></section>
      <section className="hq3-login-card" aria-labelledby="hq3-login-title" aria-busy={busy}>
        <div className="hq3-login-mark">4EIGNLABZ<span>YOUR CREATIVE WORKSPACE</span></div>
        <div className="hq3-login-intro"><span className="hq3-small-orbit"><HQIcon name="spark" size={22}/></span><h2 id="hq3-login-title">{forbidden?'An invitation away.':retryLoad?'Let’s reconnect.':'Come on in.'}</h2><p>{forbidden?'Use an invited, verified account to open this workspace. An owner can help with access.':retryLoad?'Your workspace couldn’t be loaded. Try opening your calendar again.':'Sign in with your invited Google account. Your calendar will be ready when you are.'}</p></div>
        {message&&<div className="hq3-login-feedback" role="alert"><HQIcon name={forbidden?'lock':'spark'} size={17}/><p>{message}</p></div>}
        {switchAccount?<button className="hq3-btn hq3-primary hq3-recovery-button" onClick={onSignOut} disabled={busy}>{busy?'Signing out…':'Use another account'}<HQIcon name="arrow" size={17}/></button>:<div className="hq3-login-actions">
          {retryLoad&&<button className="hq3-btn hq3-primary hq3-recovery-button" onClick={onRetry} disabled={busy}>{busy?'Reconnecting…':'Try again'}<HQIcon name="arrow" size={17}/></button>}
          <button className="hq3-oauth" onClick={onGoogle} disabled={busy||preview||!onGoogle}><GoogleIcon/>{busy?'Please wait…':'Continue with Google'}<HQIcon name="arrow" size={17}/></button>
          <button className="hq3-oauth" disabled aria-describedby="chatgpt-availability"><HQIcon name="spark"/>Continue with ChatGPT<span className="hq3-unavailable">Unavailable</span></button>
          <p id="chatgpt-availability" className="hq3-auth-note">ChatGPT sign-in is not available for this workspace.</p>
        </div>}
        {preview&&<p className="hq3-auth-note">Design preview · sign-in is disabled here.</p>}
        <div className="hq3-login-foot"><HQIcon name="lock" size={14}/><span>Invite-only. Your workspace stays private.</span></div>
      </section>
    </div>
    <footer className="hq3-login-footer"><span>4EIGNLABZ © {new Date().getFullYear()}</span><span>CREATE WITH INTENTION. ALWAYS.</span></footer>
  </main>;
}
