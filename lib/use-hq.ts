'use client';
import {useCallback,useEffect,useState,useRef} from 'react';
import {DemoRepository} from './demo-repository';
import type {AuthState,HQRepository,Media,PostInput,Role,Snapshot,TaskProgress} from './types';
import {classifyAuthIssue,withAuthDeadline,WORKSPACE_LOAD_TIMEOUT_MS,type AuthIssue} from './auth-flow';

type LoadTicket={epoch:number;version:number};
/** Coordinates initial loads, refreshes, and logout without retaining private data. */
export class HQRequestGate {
  private epoch=0;
  private version=0;
  private closed=false;
  open():number {this.epoch++;this.version++;this.closed=false;return this.epoch;}
  close():number {this.epoch++;this.version++;this.closed=true;return this.epoch;}
  current():number {return this.epoch;}
  matches(epoch:number):boolean {return epoch===this.epoch;}
  active(epoch:number):boolean {return this.matches(epoch)&&!this.closed;}
  beginLoad():LoadTicket|null {return this.closed?null:{epoch:this.epoch,version:++this.version};}
  accepts(ticket:LoadTicket):boolean {return this.active(ticket.epoch)&&ticket.version===this.version;}
}
function authStatus(error:unknown):AuthState {
  const issue=classifyAuthIssue(error);
  if(!issue||issue.kind==='cancelled'||issue.kind==='expired')return 'signed_out';
  return issue.kind==='forbidden'||issue.kind==='unverified'?'forbidden':'error';
}
export function useHQ(forceDemo=false) {
  const configured=!forceDemo;
  const [repo,setRepo]=useState<HQRepository|null>(null);
  const [data,setData]=useState<Snapshot|null>(null);
  const [status,setStatus]=useState<AuthState>('loading');
  const [error,setError]=useState<string|null>(null);
  const [authIssue,setAuthIssue]=useState<AuthIssue|null>(null);
  const [setupAttempt,setSetupAttempt]=useState(0);
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  const logoutPending=useRef(false);
  const requests=useRef(new HQRequestGate());
  const mode=configured?'production' as const:'demo' as const;
  const reportAuthFailure=useCallback((failure:unknown)=>{
    const issue=classifyAuthIssue(failure);
    setData(null);setAuthIssue(issue);setError(issue?.message??null);setStatus(authStatus(failure));
  },[]);

  useEffect(()=>{
    let alive=true;
    const gate=requests.current;
    const epoch=gate.open();
    pending.current=false;logoutPending.current=false;
    async function setup(){
      let ticket:LoadTicket|null=null;
      try {
        let repository:HQRepository;
        if(configured){const {createSupabaseRepository}=await withAuthDeadline(import('./supabase-repository'));repository=createSupabaseRepository();}
        else repository=new DemoRepository();
        if(!alive||!gate.active(epoch))return;
        setRepo(repository);setData(null);setStatus('loading');setBusy(false);
        ticket=gate.beginLoad();
        if(!ticket)return;
        const snapshot=await withAuthDeadline(repository.load(),WORKSPACE_LOAD_TIMEOUT_MS);
        if(alive&&gate.accepts(ticket)){setData(snapshot);setStatus('ready');setError(null);setAuthIssue(null);}
      }catch(e){
        if(alive&&gate.active(epoch)&&(!ticket||gate.accepts(ticket))){
          reportAuthFailure(e);
        }
      }
    }
    void setup();
    return ()=>{alive=false;gate.close();};
  },[configured,setupAttempt,reportAuthFailure]);

  const refresh=useCallback(async():Promise<boolean>=>{
    if(!repo)return false;
    const gate=requests.current;
    const ticket=gate.beginLoad();
    if(!ticket)return false;
    try{
      const snapshot=await withAuthDeadline(repo.load(),WORKSPACE_LOAD_TIMEOUT_MS);
      if(!gate.accepts(ticket))return false;
      setData(snapshot);setStatus('ready');setError(null);setAuthIssue(null);return true;
    }catch(e){
      if(!gate.accepts(ticket))return false;
      reportAuthFailure(e);return false;
    }
  },[repo,reportAuthFailure]);

  useEffect(()=>{
    if(!repo||repo.mode!=='production')return;
    const onFocus=()=>{void refresh();};
    window.addEventListener('focus',onFocus);
    const timer=window.setInterval(onFocus,240000);
    const observable=repo as HQRepository & {onAuthChange?:(callback:()=>void)=>()=>void};
    const unsubscribe=observable.onAuthChange?.(onFocus);
    return ()=>{window.removeEventListener('focus',onFocus);window.clearInterval(timer);unsubscribe?.();};
  },[repo,refresh]);

  async function run(action:()=>Promise<unknown>):Promise<boolean> {
    const gate=requests.current;const epoch=gate.current();
    if(!repo||pending.current||!gate.active(epoch))return false;
    pending.current=true;setBusy(true);setError(null);
    try{
      await action();
      if(!gate.active(epoch))return false;
      // A successful write followed by a failed refresh is not a verified UI success.
      return await refresh();
    }catch(e){
      if(gate.active(epoch))setError(e instanceof Error?e.message:'No se pudo guardar. Intenta de nuevo.');
      return false;
    }finally{
      if(gate.matches(epoch)){pending.current=false;setBusy(false);}
    }
  }

  return {
    mode,status,data,error,authIssue,busy,refresh,clearError:()=>setError(null),
    retry:async():Promise<boolean>=>{
      if(pending.current||!requests.current.active(requests.current.current()))return false;
      setError(null);setAuthIssue(null);setStatus('loading');
      if(!repo){setSetupAttempt(attempt=>attempt+1);return false;}
      const epoch=requests.current.current();pending.current=true;setBusy(true);
      try{return await refresh();}
      finally{if(requests.current.matches(epoch)){pending.current=false;setBusy(false);}}
    },
    savePost:(input:PostInput)=>run(()=>repo!.savePost(input)),
    saveProgress:(id:string,progress:TaskProgress)=>run(()=>repo!.saveProgress(id,progress)),
    getAccessToken:async()=>{
      const gate=requests.current;const epoch=gate.current();
      if(!gate.active(epoch))return null;
      const token=await repo?.getAccessToken?.()??null;
      return gate.active(epoch)?token:null;
    },
    deletePost:(id:string)=>run(()=>repo!.deletePost(id)),
    saveVision:(text:string)=>run(()=>repo!.saveVision(text)),
    addComment:(postId:string,body:string)=>run(()=>repo!.addComment(postId,body)),
    uploadMedia:async(file:File):Promise<Media|null>=>{
      const gate=requests.current;const epoch=gate.current();
      if(!repo||pending.current||!gate.active(epoch))return null;
      pending.current=true;setBusy(true);setError(null);
      try{const media=await repo.uploadMedia(file);return gate.active(epoch)?media:null;}
      catch(e){if(gate.active(epoch))setError(e instanceof Error?e.message:'No se pudo subir el archivo.');return null;}
      finally{if(gate.matches(epoch)){pending.current=false;setBusy(false);}}
    },
    signIn:async(email:string,password:string)=>{
      if(!repo||pending.current)return false;
      requests.current.open();
      return run(()=>repo.signIn(email,password));
    },
    signInWithGoogle:async()=>{
      if(!repo||pending.current)return;
      const gate=requests.current;const epoch=gate.open();
      pending.current=true;setBusy(true);setError(null);setAuthIssue(null);
      try{await repo.signInWithGoogle();}
      catch(e){if(gate.active(epoch))reportAuthFailure(e);}
      finally{if(gate.matches(epoch)){pending.current=false;setBusy(false);}}
    },
    signOut:async()=>{
      if(!repo||logoutPending.current)return;
      const gate=requests.current;const epoch=gate.close();
      // Logout takes precedence even if a mutation or initial load is still pending.
      logoutPending.current=true;pending.current=true;
      setBusy(true);setData(null);setStatus('signed_out');setError(null);setAuthIssue(null);
      try{await repo.signOut();}
      catch(e){if(gate.matches(epoch)){const issue=classifyAuthIssue(e);setAuthIssue(issue?{...issue,retry:'switch_account'}:null);setError(issue?.message??'Sign-out could not finish. Please try again.');}}
      finally{if(gate.matches(epoch)){logoutPending.current=false;pending.current=false;setBusy(false);}}
      // Remain closed after errors too: background refresh must not restore a session.
      // Explicit sign-in opens a new generation; a late old response stays invalid.
    },
    switchDemoRole:async(role:Role)=>{if(repo instanceof DemoRepository)return run(()=>repo.switchRole(role));return false;},
    resetDemo:async()=>{if(repo instanceof DemoRepository)return run(()=>repo.reset());return false;},
  };
}
