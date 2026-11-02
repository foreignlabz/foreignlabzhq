import { fixtureSnapshot } from './fixtures';
import { validatePost,validateMedia,validateComment,canEditPost,assertCanWrite,validateProgress } from './validation';
import type {HQRepository,Snapshot,PostInput,Post,Vision,Comment,Media,Role,TaskProgress} from './types';
import {isDemoMediaUrlActive} from './demo-media';
const STORAGE_KEY='4eign-hq3-demo-v1';
function requireWriter(data:Snapshot):void {
  assertCanWrite(data.member.role);
}
export class DemoRepository implements HQRepository {
  readonly mode='demo' as const;
  private data:Snapshot|null=null;
  async load():Promise<Snapshot> {
    // Re-read persisted demo state so a stale detail form cannot undo a newer
    // progress change. This is a local demo, not a multi-user database lock.
    try {const saved=localStorage.getItem(STORAGE_KEY);if(saved)this.data=JSON.parse(saved);else if(!this.data)this.data=fixtureSnapshot();}catch {if(!this.data)this.data=fixtureSnapshot();}
    if (!this.data || !Array.isArray(this.data.posts) || !this.data.member) this.data=fixtureSnapshot();
    // Preserve current-session attachments across remounts. An expired blob
    // cannot be reopened after reload, so return an unattached post instead.
    this.data.posts=this.data.posts.map(post=>post.media?.url.startsWith('blob:')&&!isDemoMediaUrlActive(post.media.url)?{...post,media:null}:post);
    return structuredClone(this.data);
  }
  private persist(data:Snapshot):void {
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch {throw new Error('No se pudo guardar en este navegador. Libera espacio o elimina archivos de la demo.');}
    this.data=structuredClone(data);
  }
  async savePost(input:PostInput):Promise<Post> {
    const data=await this.load();requireWriter(data);const clean=validatePost(input,data);const existing=data.posts.find(p=>p.id===input.id);
    const post:Post={...clean,taskProgress:existing?.taskProgress??'not_started',id:input.id??crypto.randomUUID(),createdBy:existing?.createdBy??data.member.id,updatedAt:new Date().toISOString()};
    data.posts=[post,...data.posts.filter(p=>p.id!==post.id)];this.persist(data);return post;
  }
  async saveProgress(id:string,progress:TaskProgress):Promise<void> {
    const data=await this.load();requireWriter(data);
    validateProgress(progress);
    const post=data.posts.find(p=>p.id===id);if(!post)throw new Error('La publicación no existe.');
    post.taskProgress=progress;post.updatedAt=new Date().toISOString();this.persist(data);
  }
  async deletePost(id:string):Promise<void> {const data=await this.load();requireWriter(data);const post=data.posts.find(p=>p.id===id);if(!post)throw new Error('La publicación no existe.');if(!canEditPost(post,data.member.role))throw new Error('Solo el owner puede eliminar contenido aprobado.');data.posts=data.posts.filter(p=>p.id!==id);data.comments=data.comments.filter(c=>c.postId!==id);this.persist(data);}
  async saveVision(text:string):Promise<Vision> {const data=await this.load();if(data.member.role!=='owner')throw new Error('Solo el owner puede editar la visión.');if(!text.trim()||text.length>3000)throw new Error('La visión debe tener entre 1 y 3,000 caracteres.');data.vision={...data.vision,text:text.trim(),updatedAt:new Date().toISOString()};this.persist(data);return data.vision;}
  async addComment(postId:string,body:string):Promise<Comment> {const data=await this.load();requireWriter(data);if(!data.posts.some(p=>p.id===postId))throw new Error('La publicación no existe.');const comment={id:crypto.randomUUID(),postId,authorId:data.member.id,body:validateComment(body),createdAt:new Date().toISOString()};data.comments.push(comment);this.persist(data);return comment;}
  async uploadMedia(file:File):Promise<Media> {requireWriter(await this.load());validateMedia(file,2*1024*1024);const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('No se pudo leer el archivo.'));reader.readAsDataURL(file);});return {url,type:file.type.startsWith('image/')?'image':'video',name:file.name};}
  async signIn():Promise<void> {throw new Error('La demo no usa credenciales.');}
  async signInWithGoogle():Promise<void> {throw new Error('Google OAuth no está disponible en la demo. Abre el acceso privado configurado.');}
  async signOut():Promise<void> { /* Demo has no authenticated session. */ }
  // These explicit demo controls change fixtures only; they are not auth APIs.
  async switchRole(role:Role):Promise<void> {const data=await this.load();const member=data.members.find(m=>m.role===role);if(!member)throw new Error('El rol no está disponible en esta demo.');data.member=member;this.persist(data);}
  async reset():Promise<void> {this.persist(fixtureSnapshot());}
}
