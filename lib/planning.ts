import {fromLocalInput,toLocalInput} from './dates';
import type {Post} from './types';

/** Legacy single-account posts and collaborative posts share one canonical ID. */
export function postAccountIds(post:Pick<Post,'accountId'|'accountIds'>):string[] {
  return [...new Set([post.accountId,...(post.accountIds??[])].filter(Boolean))];
}

/** An empty account selection means every account, without duplicating collabs. */
export function filterPostsByAccounts(posts:readonly Post[],accountIds:readonly string[]):Post[] {
  const selected=new Set(accountIds);
  return posts.filter(post=>!selected.size||postAccountIds(post).some(id=>selected.has(id)));
}

/** Change only the Puerto Rico date, keeping the exact local time of day. */
export function moveScheduleToDate(scheduledAt:string,date:string):string {
  const local=toLocalInput(scheduledAt);
  if(!local||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Selecciona una fecha y hora válidas.');
  const minute=fromLocalInput(local);
  const moved=fromLocalInput(`${date}T${local.slice(11)}`);
  return new Date(Date.parse(moved)+Date.parse(scheduledAt)-Date.parse(minute)).toISOString();
}

function newestFirst(a:Post,b:Post):number {
  const difference=Date.parse(b.scheduledAt)-Date.parse(a.scheduledAt);
  return difference||(a.id<b.id?-1:a.id>b.id?1:0);
}

function feedCandidates(posts:readonly Post[],accountId:string):Post[] {
  const unique=new Map<string,Post>();
  for(const post of filterPostsByAccounts(posts,[accountId])) {
    if(!unique.has(post.id)&&Number.isFinite(Date.parse(post.scheduledAt)))unique.set(post.id,post);
  }
  return [...unique.values()];
}

/** Published metadata is a snapshot, not proof of a live Instagram connection. */
export function currentFeedPosts(posts:readonly Post[],accountId:string):Post[] {
  return feedCandidates(posts,accountId).filter(post=>post.status==='published').sort(newestFirst);
}

/**
 * Project the grid after scheduled posts publish: latest planned first, followed
 * by existing published posts. Ideas and undated posts have no grid position.
 */
export function futureFeedPosts(posts:readonly Post[],accountId:string):Post[] {
  const candidates=feedCandidates(posts,accountId);
  const planned=candidates.filter(post=>['draft','in_review','approved'].includes(post.status)).sort(newestFirst);
  const published=candidates.filter(post=>post.status==='published').sort(newestFirst);
  return [...planned,...published];
}
