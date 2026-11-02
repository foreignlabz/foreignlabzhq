import Workspace from '@/components/workspace';
// The single PKCE-enabled Supabase browser client completes the callback during
// initialization. Workspace then verifies the user and trusted membership.
export default function AuthCallback(){return <Workspace/>;}
