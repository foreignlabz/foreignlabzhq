import Workspace from '@/components/workspace';
import WorkspaceLogin from '@/components/workspace-login';
// The single PKCE-enabled Supabase browser client completes the callback during
// initialization. Workspace then verifies the user and trusted membership.
export default function AuthCallback(){return process.env.HQ_STAGING_DEMO==='true'?<WorkspaceLogin preview/>:<Workspace/>;}
