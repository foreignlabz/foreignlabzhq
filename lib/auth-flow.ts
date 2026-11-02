/** User-facing auth failures never echo callback descriptions, URLs, or tokens. */
export type AuthIssue = {
  kind:'cancelled'|'expired'|'network'|'timeout'|'configuration'|'forbidden'|'unverified'|'unknown';
  message:string;
  retry:'google'|'reload'|'switch_account'|null;
};
export const AUTH_REQUEST_TIMEOUT_MS=10_000;
export const AUTH_OPERATION_TIMEOUT_MS=15_000;
export const WORKSPACE_LOAD_TIMEOUT_MS=20_000;
const ISSUES:Record<AuthIssue['kind'],AuthIssue>={
  cancelled:{kind:'cancelled',message:'Google sign-in wasn’t completed. You can try again.',retry:'google'},
  expired:{kind:'expired',message:'This sign-in link has expired or is no longer valid. Continue with Google again.',retry:'google'},
  network:{kind:'network',message:'We couldn’t reach the workspace. Check your connection and try again.',retry:'reload'},
  timeout:{kind:'timeout',message:'The workspace is taking too long to respond. Please try again.',retry:'reload'},
  configuration:{kind:'configuration',message:'Sign-in is not available right now. Please try again or contact the workspace owner.',retry:'reload'},
  forbidden:{kind:'forbidden',message:'This Google account doesn’t have access to the workspace. Use an invited account or contact the owner.',retry:'switch_account'},
  unverified:{kind:'unverified',message:'Please use a Google account with a verified email address.',retry:'switch_account'},
  unknown:{kind:'unknown',message:'We couldn’t open the calendar. Please try again.',retry:'reload'},
};
export class HQAuthFlowError extends Error {
  readonly code='AUTH_FLOW';
  constructor(public issue:AuthIssue){super(issue.message);this.name='HQAuthFlowError';}
}
export function authIssue(kind:AuthIssue['kind'],retry?:AuthIssue['retry']):AuthIssue {return {...ISSUES[kind],...(retry===undefined?{}:{retry})};}
function details(error:unknown):Record<string,unknown>{return typeof error==='object'&&error!==null?error as Record<string,unknown>:{};}
export function classifyAuthIssue(error:unknown):AuthIssue|null {
  if(error instanceof HQAuthFlowError)return error.issue;
  const value=details(error);const code=String(value.code??'');const name=String(value.name??'');
  if(code==='SIGNED_OUT'||name==='AuthSessionMissingError')return null;
  if(code==='FORBIDDEN')return authIssue(value.reason==='unverified'?'unverified':'forbidden');
  const message=String(value.message??'');
  if(name==='TimeoutError'||code==='AUTH_TIMEOUT'||message.includes('HQ_AUTH_TIMEOUT'))return authIssue('timeout');
  if(['bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used','flow_state_not_found','flow_state_expired','bad_code_verifier','invalid_credentials'].includes(code)||value.status===401||/PKCE|code.*verifier/i.test(name))return authIssue('expired');
  if(['provider_disabled','oauth_provider_not_supported','signup_disabled','email_provider_disabled'].includes(code))return authIssue('configuration');
  if(name==='AuthRetryableFetchError'||name==='AbortError'||(typeof value.status==='number'&&value.status>=500)||/fetch failed|failed to fetch|network|load failed/i.test(message))return authIssue('network');
  return authIssue('unknown');
}
export function asAuthFlowError(error:unknown):HQAuthFlowError {return error instanceof HQAuthFlowError?error:new HQAuthFlowError(classifyAuthIssue(error)??authIssue('expired'));}

const AUTH_PARAMETERS=['code','sb_flow_id','error','error_code','error_description','access_token','refresh_token','provider_token','provider_refresh_token','expires_in','expires_at','token_type','type','state'];
export function inspectAuthCallback(href:string):{present:boolean;hasCode:boolean;issue:AuthIssue|null} {
  const url=new URL(href);const hash=new URLSearchParams(url.hash.slice(1));
  const get=(key:string)=>url.searchParams.get(key)??hash.get(key);
  const present=AUTH_PARAMETERS.some(key=>url.searchParams.has(key)||hash.has(key));
  const hasCode=url.searchParams.has('code')||hash.has('code');const error=get('error');const code=get('error_code');
  let issue:AuthIssue|null=null;
  if(error||code||get('error_description')){
    if(['signup_disabled','user_banned','hook_error'].includes(code??''))issue=authIssue('forbidden');
    else if(error==='access_denied')issue=authIssue('cancelled');
    else if(code&&['flow_state_expired','flow_state_not_found','bad_code_verifier'].includes(code))issue=authIssue('expired');
    else issue={...authIssue('configuration'),retry:'google'};
  }
  return {present,hasCode,issue};
}
/** Produces a same-path relative URL, never a redirect destination from input. */
export function sanitizedAuthPath(href:string):string {
  const url=new URL(href);const fragment=new URLSearchParams(url.hash.slice(1));
  const authHash=AUTH_PARAMETERS.some(key=>fragment.has(key));
  for(const key of AUTH_PARAMETERS){url.searchParams.delete(key);fragment.delete(key);}
  if(authHash)url.hash=fragment.toString()?`#${fragment.toString()}`:'';
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function withAuthDeadline<T>(operation:PromiseLike<T>,timeoutMs=AUTH_OPERATION_TIMEOUT_MS,retry:AuthIssue['retry']='reload'):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new HQAuthFlowError(authIssue('timeout',retry))),timeoutMs);}),
    ]);
  }finally{if(timer!==undefined)clearTimeout(timer);}
}

/** Bound only Auth requests; do not impose an upload timeout on media operations. */
export function createBoundedAuthFetch(fetcher:typeof fetch,timeoutMs=AUTH_REQUEST_TIMEOUT_MS):typeof fetch {
  return async(input,init)=>{
    const href=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(!new URL(href).pathname.startsWith('/auth/v1/'))return fetcher(input,init);
    const controller=new AbortController();
    const incoming=init?.signal??(typeof Request!=='undefined'&&input instanceof Request?input.signal:undefined);
    const abort=()=>controller.abort(incoming?.reason);
    if(incoming?.aborted)abort();else incoming?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(new DOMException('HQ_AUTH_TIMEOUT','TimeoutError')),timeoutMs);
    try{
      const response=await fetcher(input,{...init,signal:controller.signal});
      // Auth exchanges are small JSON responses. Keep the deadline through body
      // receipt too; headers alone must not leave SDK initialization hanging.
      await response.clone().arrayBuffer();
      return response;
    }
    finally{clearTimeout(timer);incoming?.removeEventListener('abort',abort);}
  };
}

export type AuthStartup={wait:()=>Promise<void>};
/** Supabase initialize() reports URL errors; getUser() alone discards that result. */
export function createAuthStartup(options:{
  initialize:()=>Promise<{error:unknown}>;
  readHref?:()=>string;
  replacePath?:(path:string)=>void;
}):AuthStartup {
  const callback=options.readHref?inspectAuthCallback(options.readHref()):{present:false,hasCode:false,issue:null};
  let observed=false;
  const complete=(error:unknown):AuthIssue|null=>{
    let issue=callback.issue??(error?classifyAuthIssue(error):null);
    // Without a stored verifier the SDK treats a code URL as ordinary navigation.
    // A leftover code must never fall through to a previously stored identity.
    if(!issue&&callback.hasCode&&options.readHref&&inspectAuthCallback(options.readHref()).hasCode)issue=authIssue('expired');
    if(callback.present&&options.readHref&&options.replacePath)options.replacePath(sanitizedAuthPath(options.readHref()));
    return issue&&callback.present&&issue.retry==='reload'?{...issue,retry:'google'}:issue;
  };
  // Capture and sanitize only AFTER SDK processing settles, including errors.
  const settled=Promise.resolve().then(options.initialize).then(result=>complete(result.error),error=>complete(error));
  return {async wait(){
    const issue=await withAuthDeadline(settled,AUTH_OPERATION_TIMEOUT_MS,callback.present?'google':'reload');
    const report=!!issue&&(callback.present||!observed);observed=true;
    if(report)throw new HQAuthFlowError(issue!);
  }};
}
