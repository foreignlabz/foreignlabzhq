export const TIME_ZONE = 'America/Puerto_Rico';
export function dateKey(iso: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
  const get = (type:string) => parts.find(p=>p.type===type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function toLocalInput(iso:string):string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  const time = new Intl.DateTimeFormat('en-GB',{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
  return `${dateKey(iso)}T${time}`;
}
export function fromLocalInput(value:string):string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Selecciona una fecha y hora válidas.');
  const result = new Date(`${value}:00-04:00`);
  if (Number.isNaN(result.getTime()) || toLocalInput(result.toISOString()) !== value) throw new Error('La fecha no es válida.');
  return result.toISOString();
}
export function formatDate(iso:string,opts:Intl.DateTimeFormatOptions={}):string {
  if (!iso || Number.isNaN(Date.parse(iso))) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PR',{...(Object.keys(opts).length?opts:{day:'numeric',month:'short'}),timeZone:TIME_ZONE}).format(new Date(iso));
}
export function monthLabel(year:number,month:number):string {return new Intl.DateTimeFormat('es-PR',{year:'numeric',month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1,12)));}
export function monthGrid(year:number,month:number):{date:string;day:number;inMonth:boolean}[] {
  const first=new Date(Date.UTC(year,month,1,12)); const mondayOffset=(first.getUTCDay()+6)%7;
  return Array.from({length:42},(_,i)=>{const date=new Date(Date.UTC(year,month,1-mondayOffset+i,12));return {date:date.toISOString().slice(0,10),day:date.getUTCDate(),inMonth:date.getUTCMonth()===month};});
}
export function weekStart(iso = new Date().toISOString()):string {
  const date=new Date(`${dateKey(iso)}T12:00:00Z`); date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7); return date.toISOString().slice(0,10);
}
