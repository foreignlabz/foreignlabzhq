import { STATUSES, TASK_PROGRESS, type Post, type PostInput, type Snapshot, type Role, type TaskProgress } from './types';
export function canWrite(role:Role):boolean {return ['owner','manager','collaborator'].includes(role);}
export function assertCanWrite(role:Role):void {if(!canWrite(role))throw new Error('Esta membresía es de solo lectura.');}
export function validateProgress(progress:TaskProgress):TaskProgress {if(!TASK_PROGRESS.includes(progress))throw new Error('Progreso no válido.');return progress;}
export function validatePost(input:PostInput,data:Snapshot):PostInput {
  assertCanWrite(data.member.role);
  const title=input.title.trim(); const caption=input.caption.trim();
  if (!title || title.length>160) throw new Error('El título debe tener entre 1 y 160 caracteres.');
  if (caption.length>5000) throw new Error('El caption admite hasta 5,000 caracteres.');
  if (!data.accounts.some(a=>a.id===input.accountId)) throw new Error('Selecciona una cuenta válida.');
  const accountIds=[...new Set(input.accountIds??[input.accountId])];
  if (!accountIds.includes(input.accountId)||accountIds.length>10||accountIds.some(id=>!data.accounts.some(a=>a.id===id))) throw new Error('Las cuentas colaboradoras no son válidas.');
  const notes=(input.notes??'').trim();
  if(notes.length>10000)throw new Error('Las notas admiten hasta 10,000 caracteres.');
  if(input.taskProgress!==undefined)validateProgress(input.taskProgress);
  if (!data.members.some(m=>m.id===input.responsibleId)) throw new Error('Selecciona un responsable del equipo.');
  if (!STATUSES.includes(input.status)) throw new Error('Estado no válido.');
  if (!input.scheduledAt || Number.isNaN(Date.parse(input.scheduledAt))) throw new Error('Selecciona una fecha válida.');
  const existing=data.posts.find(p=>p.id===input.id);
  if (input.id && !existing) throw new Error('La publicación ya no existe.');
  if (data.member.role!=='owner' && (['approved','published'].includes(input.status) || (existing && ['approved','published'].includes(existing.status)))) throw new Error('Solo el owner puede aprobar, publicar o modificar contenido aprobado.');
  const videoUrl=input.videoUrl.trim();
  if (videoUrl) {let url:URL;try {url=new URL(videoUrl);}catch {throw new Error('Usa un enlace de video HTTPS válido.');}if (url.protocol!=='https:'||url.username||url.password) throw new Error('Usa un enlace de video HTTPS válido.');}
  if (videoUrl && input.media) throw new Error('Elige un archivo o un enlace de video, no ambos.');
  return {...input,title,caption,videoUrl,accountIds,notes};
}
export function canEditPost(post:Post,role:Snapshot['member']['role']):boolean {return canWrite(role)&&(role==='owner'||!['approved','published'].includes(post.status));}
export function validateMedia(file:Pick<File,'type'|'size'>,maxBytes=25*1024*1024):void {
  if (!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type)) throw new Error('Usa JPG, PNG, WebP, MP4 o WebM.');
  if (file.size<=0 || file.size>maxBytes) throw new Error(`El archivo debe pesar menos de ${Math.round(maxBytes/1024/1024)} MB.`);
}
export function validateComment(body:string):string {const clean=body.trim();if (!clean||clean.length>2000) throw new Error('El comentario debe tener entre 1 y 2,000 caracteres.');return clean;}
