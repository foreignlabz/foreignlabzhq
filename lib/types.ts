export const STATUSES = ['idea', 'draft', 'in_review', 'approved', 'published'] as const;
export type PostStatus = typeof STATUSES[number];
export type Role = 'owner' | 'manager' | 'brand_member' | 'collaborator';
export const TASK_PROGRESS = ['not_started', 'in_progress', 'done'] as const;
export type TaskProgress = typeof TASK_PROGRESS[number];
export type Member = { id: string; name: string; role: Role };
export type Account = { id: string; name: string; handle: string; color: string };
export type Media = { path?: string; url: string; type: 'image' | 'video'; name: string };
export type Post = { id: string; accountId: string; accountIds?: string[]; notes?: string; taskProgress?: TaskProgress; title: string; caption: string; scheduledAt: string; responsibleId: string; status: PostStatus; media: Media | null; videoUrl: string; createdBy: string; updatedAt: string };
export type PostInput = Omit<Post, 'id' | 'createdBy' | 'updatedAt'> & { id?: string };
export type Comment = { id: string; postId: string; authorId: string; body: string; createdAt: string };
export type Vision = { id: string; weekStart: string; text: string; updatedAt: string };
export type Snapshot = { workspaceId: string; workspaceName: string; member: Member; members: Member[]; accounts: Account[]; posts: Post[]; comments: Comment[]; vision: Vision };
export interface HQRepository {
  readonly mode: 'demo' | 'production';
  load(): Promise<Snapshot>;
  savePost(input: PostInput): Promise<Post>;
  saveProgress(id: string, progress: TaskProgress): Promise<void>;
  deletePost(id: string): Promise<void>;
  saveVision(text: string): Promise<Vision>;
  addComment(postId: string, body: string): Promise<Comment>;
  uploadMedia(file: File): Promise<Media>;
  signIn(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  getAccessToken?(): Promise<string|null>;
  signOut(): Promise<void>;
}
export type AuthState = 'loading' | 'ready' | 'signed_out' | 'forbidden' | 'error';
