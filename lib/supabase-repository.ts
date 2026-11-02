import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import type {HQRepository,Snapshot,Member,Account,Post,PostInput,Comment,Vision,Media,PostStatus,Role,TaskProgress} from './types';
import {weekStart} from './dates';
import {publicSupabaseConfig} from './public-config';
import {validatePost,validateComment,validateMedia,canEditPost,assertCanWrite,validateProgress} from './validation';
const BUCKET='hq-media';
export class HQAccessError extends Error {constructor(public code:'SIGNED_OUT'|'FORBIDDEN',message:string){super(message);this.name='HQAccessError';}}
type Row=Record<string,unknown>;
type BackendError={message:string;code?:string}|null;
function str(value:unknown):string{return typeof value==='string'?value:'';}
function fail(error:BackendError):void {if(error)throw new Error(error.message);}
export function isMissingProgressSchema(error:BackendError):boolean {
  return !!error && ['42P01','PGRST205'].includes(error.code??'') && error.message.includes('content_post_progress');
}
function failWrite(error:BackendError):void {
  if(error&&((['42703','PGRST204'].includes(error.code??'')&&/account_ids|notes/.test(error.message))||isMissingProgressSchema(error))) {
    throw new Error('HQ 3.0 requiere la migración de permisos, cuentas y progreso. No se guardó el cambio; pide al administrador revisar la configuración.');
  }
  fail(error);
}
function mapMember(row:Row):Member {return {id:str(row.user_id),name:str(row.name),role:row.role as Role};}
function mapComment(row:Row):Comment{return {id:str(row.id),postId:str(row.post_id),authorId:str(row.author_id),body:str(row.body),createdAt:str(row.created_at)};}
function mapVision(row:Row):Vision{return {id:str(row.id),weekStart:str(row.week_start),text:str(row.text),updatedAt:str(row.updated_at)};}
export class SupabaseRepository implements HQRepository {
  readonly mode='production' as const;
  constructor(private client:SupabaseClient){}
  async context():Promise<{workspaceId:string;member:Member}> {
    const {data:{user},error}=await this.client.auth.getUser();
    if(error||!user)throw new HQAccessError('SIGNED_OUT','Inicia sesión con una cuenta autorizada.');
    if(!user.email_confirmed_at)throw new HQAccessError('FORBIDDEN','La identidad debe tener un correo verificado.');
    const result=await this.client.from('workspace_members').select('workspace_id,user_id,name,role').eq('user_id',user.id);
    fail(result.error);
    if(!result.data?.length)throw new HQAccessError('FORBIDDEN','Tu cuenta no tiene acceso a este HQ. El owner debe autorizar tu membresía.');
    if(result.data.length!==1)throw new HQAccessError('FORBIDDEN','Hay varias membresías. Selecciona un único workspace para esta instalación.');
    const row=result.data[0];if(!['owner','manager','brand_member','collaborator'].includes(row.role))throw new HQAccessError('FORBIDDEN','El rol no es válido.');
    return {workspaceId:row.workspace_id,member:mapMember(row)};
  }
  private async mapPost(row:Row,progress:TaskProgress='not_started'):Promise<Post>{
    let media:Media|null=null;const path=str(row.media_path);
    if(path){const {data,error}=await this.client.storage.from(BUCKET).createSignedUrl(path,600);fail(error);if(!data?.signedUrl)throw new Error('No se pudo abrir el archivo privado.');media={path,url:data.signedUrl,type:row.media_type as 'image'|'video',name:str(row.media_name)};}
    const accountId=str(row.account_id);
    const accountIds=Array.isArray(row.account_ids)&&row.account_ids.length?row.account_ids.filter((id):id is string=>typeof id==='string'):[accountId];
    return {id:str(row.id),accountId,accountIds,notes:str(row.notes),taskProgress:progress,title:str(row.title),caption:str(row.caption),scheduledAt:str(row.scheduled_at),responsibleId:str(row.responsible_id),status:row.status as PostStatus,media,videoUrl:str(row.video_url),createdBy:str(row.created_by),updatedAt:str(row.updated_at)};
  }
  async load():Promise<Snapshot>{
    const {workspaceId,member}=await this.context();
    const [workspace,members,accounts,posts,comments,vision,progress]=await Promise.all([
      this.client.from('workspaces').select('id,name').eq('id',workspaceId).single(),
      this.client.from('workspace_members').select('user_id,name,role').eq('workspace_id',workspaceId),
      this.client.from('accounts').select('id,name,handle,color').eq('workspace_id',workspaceId).order('name'),
      this.client.from('content_posts').select('*').eq('workspace_id',workspaceId).order('scheduled_at',{ascending:false}),
      this.client.from('post_comments').select('*').eq('workspace_id',workspaceId).order('created_at'),
      this.client.from('weekly_visions').select('*').eq('workspace_id',workspaceId).eq('week_start',weekStart()).maybeSingle(),
      this.client.from('content_post_progress').select('post_id,progress').eq('workspace_id',workspaceId)
    ]);
    for(const result of [workspace,members,accounts,posts,comments,vision])fail(result.error);
    // Older HQ schemas remain readable, but authorization/network errors must surface.
    if(!isMissingProgressSchema(progress.error))fail(progress.error);
    const progressById=new Map((progress.data??[]).map(row=>[row.post_id,row.progress as TaskProgress]));
    return {workspaceId,workspaceName:workspace.data?.name??'4EIGN HQ',member,members:(members.data??[]).map(mapMember),accounts:(accounts.data??[]).map(row=>({id:row.id,name:row.name,handle:row.handle,color:row.color} as Account)),posts:await Promise.all((posts.data??[]).map(row=>this.mapPost(row,progressById.get(row.id)))),comments:(comments.data??[]).map(mapComment),vision:vision.data?mapVision(vision.data):{id:'',weekStart:weekStart(),text:'Define la intención de esta semana.',updatedAt:new Date().toISOString()}};
  }
  async savePost(input:PostInput):Promise<Post>{
    const snapshot=await this.load();const clean=validatePost(input,snapshot);
    if(clean.media && (!clean.media.path||!clean.media.path.startsWith(`${snapshot.workspaceId}/`)))throw new Error('El archivo no pertenece al workspace.');
    const row={workspace_id:snapshot.workspaceId,account_id:clean.accountId,account_ids:clean.accountIds,notes:clean.notes,title:clean.title,caption:clean.caption,scheduled_at:clean.scheduledAt,responsible_id:clean.responsibleId,status:clean.status,media_path:clean.media?.path??null,media_type:clean.media?.type??null,media_name:clean.media?.name??null,video_url:clean.videoUrl};
    const result=clean.id?await this.client.from('content_posts').update(row).eq('id',clean.id).eq('workspace_id',snapshot.workspaceId).select('*').single():await this.client.from('content_posts').insert({...row,created_by:snapshot.member.id}).select('*').single();
    failWrite(result.error);
    // Progress has a separate write path: saving an older editor never resets it.
    return this.mapPost(result.data!,snapshot.posts.find(post=>post.id===clean.id)?.taskProgress);
  }
  async saveProgress(id:string,progress:TaskProgress):Promise<void>{
    validateProgress(progress);const {workspaceId,member}=await this.context();assertCanWrite(member.role);
    const result=await this.client.from('content_post_progress').upsert({workspace_id:workspaceId,post_id:id,progress,updated_by:member.id},{onConflict:'workspace_id,post_id'}).select('post_id').single();
    failWrite(result.error);
    if(!result.data)throw new Error('No se pudo guardar el progreso.');
  }
  async deletePost(id:string):Promise<void>{const snapshot=await this.load();const post=snapshot.posts.find(p=>p.id===id);if(!post||!canEditPost(post,snapshot.member.role))throw new Error('No tienes permiso para eliminar esta publicación.');const result=await this.client.from('content_posts').delete().eq('id',id).eq('workspace_id',snapshot.workspaceId).select('id').single();fail(result.error);}
  async saveVision(text:string):Promise<Vision>{const {workspaceId,member}=await this.context();if(member.role!=='owner')throw new Error('Solo el owner puede editar la visión.');if(!text.trim()||text.length>3000)throw new Error('La visión debe tener entre 1 y 3,000 caracteres.');const result=await this.client.from('weekly_visions').upsert({workspace_id:workspaceId,week_start:weekStart(),text:text.trim()},{onConflict:'workspace_id,week_start'}).select('*').single();fail(result.error);return mapVision(result.data!);}
  async addComment(postId:string,body:string):Promise<Comment>{const {workspaceId,member}=await this.context();assertCanWrite(member.role);const result=await this.client.from('post_comments').insert({workspace_id:workspaceId,post_id:postId,author_id:member.id,body:validateComment(body)}).select('*').single();fail(result.error);return mapComment(result.data!);}
  async uploadMedia(file:File):Promise<Media>{
    validateMedia(file);const {workspaceId,member}=await this.context();assertCanWrite(member.role);
    const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
    const path=`${workspaceId}/${member.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
    const upload=await this.client.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});fail(upload.error);
    const metadata=await this.client.from('media_assets').insert({workspace_id:workspaceId,object_path:path,uploaded_by:member.id,name:file.name,mime_type:file.type,size_bytes:file.size});
    // An incomplete upload is preserved for authorized cleanup; never delete originals implicitly.
    if(metadata.error)throw new Error('El archivo se subió, pero no se pudo registrar. No se adjuntó; el administrador debe revisar el archivo pendiente.');
    const signed=await this.client.storage.from(BUCKET).createSignedUrl(path,600);fail(signed.error);if(!signed.data)throw new Error('No se pudo obtener el archivo privado.');
    return {path,url:signed.data.signedUrl,type:file.type.startsWith('image/')?'image':'video',name:file.name};
  }
  async signIn():Promise<void>{throw new Error('Usa Continuar con Google para iniciar sesión.');}
  async signInWithGoogle():Promise<void>{
    if(typeof window==='undefined')throw new Error('Abre el inicio de sesión en el navegador.');
    const result=await this.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('/auth/callback/',window.location.origin).href,queryParams:{prompt:'select_account'}}});
    if(result.error)throw new Error('No se pudo iniciar Google. Revisa el proveedor y las URLs autorizadas de Supabase.');
  }
  async getAccessToken():Promise<string|null>{const {data,error}=await this.client.auth.getSession();fail(error);return data.session?.access_token??null;}
  async signOut():Promise<void>{const result=await this.client.auth.signOut();fail(result.error);}
  onAuthChange(callback:()=>void):()=>void {const {data}=this.client.auth.onAuthStateChange(()=>{setTimeout(callback,0);});return ()=>data.subscription.unsubscribe();}
}
let browserClient:{url:string;key:string;client:SupabaseClient}|undefined;
export function createSupabaseRepository():HQRepository {
  const {url,publishableKey:key}=publicSupabaseConfig();
  if(!url||!key)throw new Error('Configuración incompleta: faltan la URL o la clave publicable de Supabase.');
  const parsed=new URL(url);if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('La URL de Supabase debe usar HTTPS.');
  if(!key.startsWith('sb_publishable_'))throw new Error('Usa una clave publicable de Supabase. Nunca una clave secreta ni service_role.');
  // Reuse one browser Auth client so React remounts cannot exchange the PKCE code twice.
  if(typeof window!=='undefined'&&browserClient?.url===url&&browserClient.key===key)return new SupabaseRepository(browserClient.client);
  const client=createClient(url,key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  if(typeof window!=='undefined')browserClient={url,key,client};
  return new SupabaseRepository(client);
}
