'use client';
import {useCallback,useEffect,useState,useRef} from 'react';
import {DemoRepository} from './demo-repository';
import type {AuthState,HQRepository,Media,PostInput,Role,Snapshot,TaskProgress} from './types';

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
  const code=(error as {code?:string})?.code;
  return code==='SIGNED_OUT'?'signed_out':code==='FORBIDDEN'?'forbidden':'error';
}
export function useHQ(forceDemo=false) {
  const configured=!forceDemo;
  const [repo,setRepo]=useState<HQRepository|null>(null);
  const [data,setData]=useState<Snapshot|null>(null);
  const [status,setStatus]=useState<AuthState>('loading');
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  const logoutPending=useRef(false);
  const requests=useRef(new HQRequestGate());
  const mode=configured?'production' as const:'demo' as const;

  useEffect(()=>{
    let alive=true;
    const gate=requests.current;
    const epoch=gate.open();
    pending.current=false;logoutPending.current=false;
    async function setup(){
      let ticket:LoadTicket|null=null;
      try {
        let repository:HQRepository;
        if(configured){const {createSupabaseRepository}=await import('./supabase-repository');repository=createSupabaseRepository();}
        else repository=new DemoRepository();
        if(!alive||!gate.active(epoch))return;
        setRepo(repository);setData(null);setStatus('loading');setBusy(false);
        ticket=gate.beginLoad();
        if(!ticket)return;
        const snapshot=await repository.load();
        if(alive&&gate.accepts(ticket)){setData(snapshot);setStatus('ready');setError(null);}
      }catch(e){
        if(alive&&gate.active(epoch)&&(!ticket||gate.accepts(ticket))){
          setData(null);setError(authStatus(e)==='signed_out'?null:e instanceof Error?e.message:'Configuración no válida.');setStatus(authStatus(e));
        }
      }
    }
    void setup();
    return ()=>{alive=false;gate.close();};
  },[configured]);

  const refresh=useCallback(async():Promise<boolean>=>{
    if(!repo)return false;
    const gate=requests.current;
    const ticket=gate.beginLoad();
    if(!ticket)return false;
    try{
      const snapshot=await repo.load();
      if(!gate.accepts(ticket))return false;
      setData(snapshot);setStatus('ready');setError(null);return true;
    }catch(e){
      if(!gate.accepts(ticket))return false;
      setData(null);setStatus(authStatus(e));setError(authStatus(e)==='signed_out'?null:e instanceof Error?e.message:'No se pudo cargar HQ.');return false;
    }
  },[repo]);

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
    mode,status,data,error,busy,refresh,clearError:()=>setError(null),
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
      pending.current=true;setBusy(true);setError(null);
      try{await repo.signInWithGoogle();}
      catch(e){if(gate.active(epoch))setError(e instanceof Error?e.message:'Google sign-in could not start.');}
      finally{if(gate.matches(epoch)){pending.current=false;setBusy(false);}}
    },
    signOut:async()=>{
      if(!repo||logoutPending.current)return;
      const gate=requests.current;const epoch=gate.close();
      // Logout takes precedence even if a mutation or initial load is still pending.
      logoutPending.current=true;pending.current=true;
      setBusy(true);setData(null);setStatus('signed_out');setError(null);
      try{await repo.signOut();}
      catch(e){if(gate.matches(epoch))setError(e instanceof Error?e.message:'No se pudo cerrar sesión.');}
      finally{if(gate.matches(epoch)){logoutPending.current=false;pending.current=false;setBusy(false);}}
      // Remain closed after errors too: background refresh must not restore a session.
      // Explicit sign-in opens a new generation; a late old response stays invalid.
    },
    switchDemoRole:async(role:Role)=>{if(repo instanceof DemoRepository)return run(()=>repo.switchRole(role));return false;},
    resetDemo:async()=>{if(repo instanceof DemoRepository)return run(()=>repo.reset());return false;},
  };
}
