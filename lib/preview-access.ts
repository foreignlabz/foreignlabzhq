import {createHmac,timingSafeEqual} from 'node:crypto';
export const PREVIEW_COOKIE='hq-preview-access';
const equals=(a:string,b:string)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);};
export function previewTicket(password:string,expires:number):string{const payload=String(expires);return `${payload}.${createHmac('sha256',password).update(payload).digest('base64url')}`;}
export function validPreviewTicket(ticket:string,password:string,now=Date.now()):boolean{const parts=ticket.split('.');const expires=Number(parts[0]);return parts.length===2&&Number.isSafeInteger(expires)&&expires>now&&expires<=now+8*60*60*1000&&equals(ticket,previewTicket(password,expires));}
export function validPreviewBasic(header:string,username:string,password:string):boolean{if(!header.startsWith('Basic '))return false;try{const value=Buffer.from(header.slice(6),'base64').toString('utf8');return equals(value,`${username}:${password}`);}catch{return false;}}
