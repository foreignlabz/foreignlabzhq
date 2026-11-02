'use client';

/* Preserve protected media URLs without an external image proxy. */
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {fromLocalInput,toLocalInput,formatDate} from '@/lib/dates';
import {postAccountIds} from '@/lib/planning';
import {canEditPost,canWrite} from '@/lib/validation';
import {STATUSES,TASK_PROGRESS,type Post,type PostStatus,type Snapshot} from '@/lib/types';
import type {useHQ} from '@/lib/use-hq';
import {HQIcon} from './workspace-icons';
import DrivePostMedia from './drive-post-media';
import './workspace-post.css';

type Props={hq:ReturnType<typeof useHQ>;data:Snapshot;post:Post|null;initialScheduledAt?:string;onClose:()=>void;onSaved:()=>void};
const statusLabels:Record<PostStatus,string>={idea:'Idea',draft:'Draft',in_review:'In review',approved:'Approved',published:'Published · manual'};
const progressLabels={not_started:'Not started',in_progress:'In progress',done:'Done'};

function editableSignature(post:Post,schedule:string):string {
  return JSON.stringify({title:post.title,caption:post.caption,accountId:post.accountId,accountIds:postAccountIds(post),schedule,responsibleId:post.responsibleId,status:post.status,media:post.media,videoUrl:post.videoUrl,notes:post.notes??''});
}

function PostPanel({hq,data,post,onClose,onSaved}:Omit<Props,'post'>&{post:Post}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const keepEditing=useRef<HTMLButtonElement>(null);
  const [draft,setDraft]=useState<Post>(()=>structuredClone(post));
  const [schedule,setSchedule]=useState(()=>toLocalInput(post.scheduledAt));
  const [baseline,setBaseline]=useState(()=>editableSignature(post,toLocalInput(post.scheduledAt)));
  const [confirmClose,setConfirmClose]=useState(false);
  const [comment,setComment]=useState('');
  const [notice,setNotice]=useState('');
  const [localError,setLocalError]=useState('');
  const [progressPending,setProgressPending]=useState(false);
  const editable=canEditPost(post,data.member.role);
  const writer=canWrite(data.member.role);
  const exists=data.posts.some(item=>item.id===post.id);
  const dirty=editableSignature(draft,schedule)!==baseline||Boolean(comment.trim());
  const progress=post.taskProgress??'not_started';
  const nextProgress=TASK_PROGRESS[(TASK_PROGRESS.indexOf(progress)+1)%TASK_PROGRESS.length];
  const comments=data.comments.filter(item=>item.postId===post.id);
  const media=draft.media;

  useEffect(()=>{
    const element=dialog.current;
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    element?.showModal();
    return ()=>{element?.close();if(opener?.isConnected)opener.focus();};
  },[]);

  function close(){
    if(hq.busy||progressPending)return;
    if(dirty){setConfirmClose(true);requestAnimationFrame(()=>keepEditing.current?.focus());}
    else onClose();
  }
  function patch(values:Partial<Post>){setDraft(previous=>({...previous,...values}));setNotice('');}
  function toggleAccount(id:string,checked:boolean){
    const ids=checked?[...new Set([...postAccountIds(draft),id])]:postAccountIds(draft).filter(account=>account!==id);
    if(!ids.length){setLocalError('Keep at least one account selected.');return;}
    setLocalError('');patch({accountIds:ids,accountId:ids.includes(draft.accountId)?draft.accountId:ids[0]});
  }
  async function save(event:FormEvent){
    event.preventDefault();if(!editable||hq.busy)return;
    setLocalError('');setNotice('');
    try{
      const scheduledAt=fromLocalInput(schedule);
      const succeeded=await hq.savePost({...draft,id:exists?draft.id:undefined,scheduledAt,taskProgress:progress});
      if(succeeded){setBaseline(editableSignature(draft,schedule));setNotice(comment.trim()?'Post saved. Your review note is still a draft; add it below before closing.':'Post saved. Nothing has been published to Instagram.');if(!comment.trim())onSaved();}
    }catch(error){setLocalError(error instanceof Error?error.message:'The post could not be saved.');}
  }
  async function changeProgress(){
    if(!writer||!exists||hq.busy||progressPending)return;
    setProgressPending(true);setLocalError('');setNotice('');
    try{if(await hq.saveProgress(post.id,nextProgress))setNotice(`Task marked ${progressLabels[nextProgress].toLowerCase()}. Approval is unchanged.`);}
    finally{setProgressPending(false);}
  }
  async function copyCaption(){
    try{await navigator.clipboard.writeText(draft.caption);setNotice('Caption copied. Publish manually when it is approved.');}
    catch{setNotice('Copy is unavailable here. Select the caption text and copy it manually.');}
  }
  async function addComment(){
    if(!writer||!exists||!comment.trim()||hq.busy)return;
    setLocalError('');if(await hq.addComment(post.id,comment)){setComment('');setNotice('Review note added.');}
  }

  return <dialog ref={dialog} className="hp-dialog" aria-labelledby="hp-title" aria-describedby="hp-description" onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
    <div className="hp-shell">
      <header className="hp-header"><div><p className="hp-eyebrow">THE NEXT CHAPTER</p><h2 id="hp-title">{exists?'Post details':'A new idea.'}</h2><p id="hp-description">{editable?'Shape the story. Keep every detail in sync.':'A closer look at the story and its progress.'}</p></div><button type="button" className="hp-close" aria-label="Close post details" disabled={hq.busy||progressPending} onClick={close} autoFocus><HQIcon name="close"/></button></header>
      {confirmClose&&<div className="hp-unsaved" role="alert"><strong>Keep your changes?</strong><p>Your unsaved edits and review note will be discarded if you close now.</p><div><button ref={keepEditing} type="button" className="hp-button" onClick={()=>setConfirmClose(false)}>Keep editing</button><button type="button" className="hp-button hp-discard" onClick={onClose}>Discard & close</button></div></div>}
      <div className="hp-body">
        {(localError||hq.error)&&<p className="hp-error" role="alert">{localError||hq.error}</p>}
        {notice&&<p className="hp-notice" role="status">{notice}</p>}
        <div className="hp-summary"><span className={`hp-status hp-status-${post.status}`}><i/>{statusLabels[post.status]}</span><span className="hp-access"><HQIcon name="lock" size={13}/>{writer?(editable?'Editing enabled':'Approved content · owner edits'):'Read-only member'}</span></div>
        <section className="hp-progress" aria-label="Task progress"><div><span className="hp-eyebrow">THE WORK, NOT THE APPROVAL</span><h3>Little steps. Real progress.</h3></div>{writer&&exists?<button type="button" className={`hp-progress-button hp-progress-${progress}`} onClick={()=>void changeProgress()} disabled={hq.busy||progressPending} aria-label={`Task progress: ${progressLabels[progress]}. Change to ${progressLabels[nextProgress]}`}><span>{progress==='done'?<HQIcon name="check" size={17}/>:progress==='in_progress'?'−':'○'}</span>{progressPending?'Saving…':progressLabels[progress]}</button>:<span className="hp-progress-value">{exists?progressLabels[progress]:'Save this idea first'}</span>}</section>
        <form onSubmit={save} id="hp-post-form" className="hp-form">
          <label className="hp-field">Title{editable?<input value={draft.title} maxLength={160} required onChange={event=>patch({title:event.target.value})}/>:<strong className="hp-read-title">{draft.title}</strong>}</label>
          <fieldset className="hp-accounts"><legend>Make it a shared story</legend>{data.accounts.map(account=><label key={account.id} className={postAccountIds(draft).includes(account.id)?'hp-account-selected':''}>{editable?<input type="checkbox" checked={postAccountIds(draft).includes(account.id)} onChange={event=>toggleAccount(account.id,event.target.checked)}/>:<span aria-hidden="true">{postAccountIds(draft).includes(account.id)?'✓':'—'}</span>}<span>{account.handle}</span></label>)}</fieldset>
          <div className="hp-fields"><label className="hp-field">Scheduled for <span>Puerto Rico · UTC−4</span>{editable?<input type="datetime-local" required value={schedule} onChange={event=>{setSchedule(event.target.value);setNotice('');}}/>:<p className="hp-value">{formatDate(post.scheduledAt,{dateStyle:'medium',timeStyle:'short'})}</p>}</label><label className="hp-field">Responsible{editable?<select value={draft.responsibleId} onChange={event=>patch({responsibleId:event.target.value})}>{data.members.filter(member=>member.role!=='brand_member').map(member=><option value={member.id} key={member.id}>{member.name}</option>)}</select>:<p className="hp-value">{data.members.find(member=>member.id===draft.responsibleId)?.name??'Unassigned'}</p>}</label></div>
          <label className="hp-field">Editorial status{editable?<select value={draft.status} onChange={event=>patch({status:event.target.value as PostStatus})}>{STATUSES.map(status=><option key={status} value={status} disabled={data.member.role!=='owner'&&['approved','published'].includes(status)}>{statusLabels[status]}</option>)}</select>:<p className="hp-value">{statusLabels[draft.status]}</p>}</label>
          {exists&&<DrivePostMedia postId={post.id} mode={hq.mode} getAccessToken={hq.getAccessToken}/>}
          {media&&<section className="hp-media" aria-label="Attached media"><div className="hp-media-frame">{media.type==='video'?<video src={media.url} controls playsInline preload="metadata" aria-label={media.name}/>:<img src={media.url} alt={media.name}/>}</div><div className="hp-media-info"><p>{media.name}</p>{editable&&<button type="button" className="hp-text-button" onClick={()=>{patch({media:null});setNotice('Attachment removed from this draft. Save to unlink it; the original file is preserved.');}}>Remove attachment</button>}</div><small>Removing an attachment only unlinks it from this post. The original is preserved.</small></section>}
          {!media&&<div className="hp-no-media"><HQIcon name="media" size={25}/><div><strong>A little room for the visual.</strong><p>{editable?'Attach an original from the Media Library.':'No media attached to this post.'}</p></div></div>}
          {draft.videoUrl.startsWith('https://')&&<a className="hp-external" href={draft.videoUrl} target="_blank" rel="noopener noreferrer">Open linked video <HQIcon name="arrow" size={14}/></a>}
          <label className="hp-field">Caption<textarea rows={6} maxLength={5000} value={draft.caption} readOnly={!editable} onChange={event=>patch({caption:event.target.value})} placeholder="Every story starts somewhere…"/></label><div className="hp-caption-footer"><span>{draft.caption.length.toLocaleString()} / 5,000</span><button type="button" className="hp-text-button" disabled={!draft.caption.trim()} onClick={()=>void copyCaption()}><HQIcon name="copy" size={15}/>Copy caption</button></div>
          <details className="hp-notes"><summary>Creative direction <span>Notes, references & the little details</span></summary>{editable?<label className="hp-field"><span className="sr-only">Creative instructions</span><textarea rows={5} maxLength={10000} value={draft.notes??''} onChange={event=>patch({notes:event.target.value})} placeholder="The mood, the shot list, the intention…"/></label>:<p>{draft.notes||'No creative instructions yet.'}</p>}</details>
          <p className="hp-publishing"><HQIcon name="lock" size={15}/><span>HQ plans the story. You publish it.<br/>Approval and “Published” are internal records. Nothing posts to Instagram automatically.</span></p>
        </form>
        <section className="hp-discussion" aria-labelledby="hp-discussion-title"><div className="hp-section-heading"><h3 id="hp-discussion-title">A little back-and-forth.</h3><span>{comments.length} {comments.length===1?'note':'notes'}</span></div>{!comments.length&&<p className="hp-empty">Keep feedback close to the work. Review notes will appear here.</p>}{comments.map(item=><article className="hp-comment" key={item.id}><div className="hp-comment-avatar" aria-hidden="true">{(data.members.find(member=>member.id===item.authorId)?.name??'M').slice(0,1)}</div><div><header><strong>{data.members.find(member=>member.id===item.authorId)?.name??'Workspace member'}</strong><time dateTime={item.createdAt}>{formatDate(item.createdAt,{month:'short',day:'numeric'})}</time></header><p>{item.body}</p></div></article>)}{writer&&exists&&<div className="hp-comment-compose"><label className="hp-field">Leave a review note<textarea rows={3} maxLength={2000} value={comment} onChange={event=>setComment(event.target.value)} placeholder="A thought, a detail, a new direction…"/></label><button type="button" className="hp-button" disabled={hq.busy||!comment.trim()} onClick={()=>void addComment()}>Add note <HQIcon name="arrow" size={15}/></button></div>}{!exists&&writer&&<p className="hp-empty">Save the post to start the conversation.</p>}</section>
      </div>
      <footer className="hp-footer"><p>{hq.mode==='demo'?'Demo workspace · local changes only':'Private workspace'}<span>{dirty?'Unsaved changes':'All caught up'}</span></p><div><button type="button" className="hp-button" disabled={hq.busy||progressPending} onClick={close}>Close</button>{editable&&<button type="submit" form="hp-post-form" className="hp-button hp-save" disabled={hq.busy||progressPending}>{hq.busy?'Saving…':exists?'Save changes':'Save idea'}<HQIcon name="arrow" size={16}/></button>}</div></footer>
    </div>
  </dialog>;
}

export default function WorkspacePost(props:Props){
  const [newPost]=useState<Post>(()=>({id:'new-post',accountId:props.data.accounts[0]?.id??'',accountIds:props.data.accounts[0]?[props.data.accounts[0].id]:[],title:'',caption:'',notes:'',scheduledAt:props.initialScheduledAt??new Date().toISOString(),responsibleId:props.data.member.id,status:'draft',taskProgress:'not_started',media:null,videoUrl:'',createdBy:props.data.member.id,updatedAt:new Date().toISOString()}));
  const post=props.post??newPost;
  return <PostPanel key={post.id} {...props} post={post}/>;
}
