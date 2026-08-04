import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';

import {
  FriendRequest,
  FriendshipStatus,
  SharedWorkout,
  UserProfile,
  WorkoutComment,
  WorkoutReaction,
  WorkoutReactionEmoji,
  WorkoutSession,
} from '../../workouts/models/workout.models';

@Injectable({ providedIn: 'root' })
export class SocialStorageService {
  constructor(private readonly firestore: Firestore) {}

  // ─── User Profiles ──────────────────────────────────────────────────────────

  async saveProfile(uid: string, displayName: string): Promise<UserProfile> {
    const safeUid = this.assertUid(uid);
    const safeName = displayName.trim();
    if (!safeName) throw new Error('Display name is required.');

    const profileRef = doc(this.firestore, `users/${safeUid}/profile/data`);
    const existing = await getDoc(profileRef);
    const now = new Date().toISOString();
    const createdAt = existing.exists() ? (existing.data()['createdAt'] as string) ?? now : now;

    const profile: Omit<UserProfile, 'uid'> = {
      displayName: safeName,
      avatarInitials: this.initials(safeName),
      createdAt,
      updatedAt: now,
    };

    await setDoc(profileRef, profile);
    return { uid: safeUid, ...profile };
  }

  async getProfile(uid: string): Promise<UserProfile | null> {
    const safeUid = this.assertUid(uid);
    const profileRef = doc(this.firestore, `users/${safeUid}/profile/data`);
    const snapshot = await getDoc(profileRef);
    if (!snapshot.exists()) return null;
    return this.normalizeProfile(safeUid, snapshot.data());
  }

  async findProfilesByDisplayName(searchTerm: string): Promise<UserProfile[]> {
    // Firestore does not support full-text search; we use a prefix range query.
    const term = searchTerm.trim().toLowerCase();
    if (term.length < 2) return [];

    // Query the public profiles sub-collection, ordered by lowercased display name.
    // Profiles must be mirrored to /publicProfiles/{uid} on save for cross-user lookup.
    const pubRef = collection(this.firestore, 'publicProfiles');
    const snap = await getDocs(
      query(
        pubRef,
        where('displayNameLower', '>=', term),
        where('displayNameLower', '<=', term + '\uf8ff'),
        orderBy('displayNameLower'),
      )
    );

    return snap.docs.map((d) => this.normalizeProfile(d.id, d.data()));
  }

  /** Save profile and mirror to publicProfiles/{uid} for cross-user search */
  async savePublicProfile(uid: string, displayName: string): Promise<UserProfile> {
    const safeUid = this.assertUid(uid);
    const safeName = displayName.trim();
    if (!safeName) throw new Error('Display name is required.');

    const now = new Date().toISOString();

    const privateRef = doc(this.firestore, `users/${safeUid}/profile/data`);
    const existing = await getDoc(privateRef);
    const createdAt = existing.exists() ? (existing.data()['createdAt'] as string) ?? now : now;

    const profile: Omit<UserProfile, 'uid'> = {
      displayName: safeName,
      avatarInitials: this.initials(safeName),
      createdAt,
      updatedAt: now,
    };

    await setDoc(privateRef, profile);

    const publicRef = doc(this.firestore, `publicProfiles/${safeUid}`);
    await setDoc(publicRef, {
      displayName: safeName,
      displayNameLower: safeName.toLowerCase(),
      avatarInitials: this.initials(safeName),
      updatedAt: now,
    });

    return { uid: safeUid, ...profile };
  }

  // ─── Friend Requests ────────────────────────────────────────────────────────

  async sendFriendRequest(fromUid: string, fromDisplayName: string, toUid: string): Promise<FriendRequest> {
    if (fromUid === toUid) throw new Error('Cannot send a friend request to yourself.');

    const reqId = `${fromUid}_${toUid}`;
    const reverseId = `${toUid}_${fromUid}`;
    const now = new Date().toISOString();

    // Prevent duplicate or reverse-duplicate requests
    const reqRef = doc(this.firestore, `friendRequests/${reqId}`);
    const reverseRef = doc(this.firestore, `friendRequests/${reverseId}`);
    const [existing, reverse] = await Promise.all([getDoc(reqRef), getDoc(reverseRef)]);

    if (existing.exists()) throw new Error('Friend request already sent.');
    if (reverse.exists()) {
      const reverseData = reverse.data() as Partial<FriendRequest>;
      if (reverseData['status'] === 'accepted') throw new Error('You are already friends.');
      if (reverseData['status'] === 'pending') throw new Error('This user has already sent you a request. Accept it from your Friends page.');
    }

    const request: Omit<FriendRequest, 'id'> = {
      fromUid,
      fromDisplayName,
      toUid,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(reqRef, request);
    return { id: reqId, ...request };
  }

  async respondToFriendRequest(requestId: string, status: 'accepted' | 'declined'): Promise<void> {
    const reqRef = doc(this.firestore, `friendRequests/${requestId}`);
    await updateDoc(reqRef, { status, updatedAt: new Date().toISOString() });
  }

  async getIncomingRequests(uid: string): Promise<FriendRequest[]> {
    const safeUid = this.assertUid(uid);
    const snap = await getDocs(
      query(collection(this.firestore, 'friendRequests'), where('toUid', '==', safeUid), where('status', '==', 'pending'))
    );
    return snap.docs.map((d) => this.normalizeFriendRequest({ id: d.id, ...d.data() }));
  }

  async getAcceptedFriends(uid: string): Promise<FriendRequest[]> {
    const safeUid = this.assertUid(uid);
    const [sent, received] = await Promise.all([
      getDocs(query(collection(this.firestore, 'friendRequests'), where('fromUid', '==', safeUid), where('status', '==', 'accepted'))),
      getDocs(query(collection(this.firestore, 'friendRequests'), where('toUid', '==', safeUid), where('status', '==', 'accepted'))),
    ]);

    const all = [
      ...sent.docs.map((d) => this.normalizeFriendRequest({ id: d.id, ...d.data() })),
      ...received.docs.map((d) => this.normalizeFriendRequest({ id: d.id, ...d.data() })),
    ];

    // Dedupe (shouldn't happen but guard anyway)
    const seen = new Set<string>();
    return all.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  friendUidFrom(request: FriendRequest, myUid: string): string {
    return request.fromUid === myUid ? request.toUid : request.fromUid;
  }

  // ─── Shared Workouts ────────────────────────────────────────────────────────

  async shareWorkout(ownerUid: string, ownerDisplayName: string, session: WorkoutSession, caption: string): Promise<SharedWorkout> {
    const safeUid = this.assertUid(ownerUid);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const shared: Omit<SharedWorkout, 'id'> = {
      ownerUid: safeUid,
      ownerDisplayName,
      session,
      caption: caption.trim(),
      reactions: { '💪': [], '🔥': [], '👏': [], '🏆': [], '😤': [] },
      comments: [],
      sharedAt: now,
      updatedAt: now,
    };

    const ref = doc(this.firestore, `sharedWorkouts/${id}`);
    await setDoc(ref, shared);
    return { id, ...shared };
  }

  async getFeedForFriends(friendUids: string[]): Promise<SharedWorkout[]> {
    if (friendUids.length === 0) return [];

    // Firestore 'in' query limited to 30 items; chunk if needed
    const chunks = this.chunk(friendUids, 30);
    const snapshots = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(this.firestore, 'sharedWorkouts'),
            where('ownerUid', 'in', chunk),
            orderBy('sharedAt', 'desc'),
          )
        )
      )
    );

    const results: SharedWorkout[] = [];
    for (const snap of snapshots) {
      for (const d of snap.docs) {
        results.push(this.normalizeSharedWorkout({ id: d.id, ...d.data() }));
      }
    }

    return results.sort((a, b) => b.sharedAt.localeCompare(a.sharedAt)).slice(0, 50);
  }

  async getMySharedWorkouts(uid: string): Promise<SharedWorkout[]> {
    const safeUid = this.assertUid(uid);
    const snap = await getDocs(
      query(collection(this.firestore, 'sharedWorkouts'), where('ownerUid', '==', safeUid), orderBy('sharedAt', 'desc'))
    );
    return snap.docs.map((d) => this.normalizeSharedWorkout({ id: d.id, ...d.data() }));
  }

  // ─── Reactions ──────────────────────────────────────────────────────────────

  async toggleReaction(sharedWorkoutId: string, uid: string, displayName: string, emoji: WorkoutReactionEmoji): Promise<SharedWorkout> {
    const ref = doc(this.firestore, `sharedWorkouts/${sharedWorkoutId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Shared workout not found.');

    const workout = this.normalizeSharedWorkout({ id: snap.id, ...snap.data() });
    const currentList: WorkoutReaction[] = workout.reactions[emoji] ?? [];
    const alreadyReacted = currentList.some((r) => r.uid === uid);

    const updatedList: WorkoutReaction[] = alreadyReacted
      ? currentList.filter((r) => r.uid !== uid)
      : [...currentList, { uid, displayName, emoji, createdAt: new Date().toISOString() }];

    const updatedReactions = { ...workout.reactions, [emoji]: updatedList };
    await updateDoc(ref, { reactions: updatedReactions, updatedAt: new Date().toISOString() });

    return { ...workout, reactions: updatedReactions };
  }

  // ─── Comments ───────────────────────────────────────────────────────────────

  async addComment(sharedWorkoutId: string, uid: string, displayName: string, text: string): Promise<SharedWorkout> {
    const safeText = text.trim();
    if (!safeText) throw new Error('Comment cannot be empty.');

    const ref = doc(this.firestore, `sharedWorkouts/${sharedWorkoutId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Shared workout not found.');

    const workout = this.normalizeSharedWorkout({ id: snap.id, ...snap.data() });
    const comment: WorkoutComment = {
      id: crypto.randomUUID(),
      uid,
      displayName,
      text: safeText,
      createdAt: new Date().toISOString(),
    };

    const updatedComments = [...workout.comments, comment];
    await updateDoc(ref, { comments: updatedComments, updatedAt: new Date().toISOString() });

    return { ...workout, comments: updatedComments };
  }

  // ─── Comparison ─────────────────────────────────────────────────────────────

  async getSharedWorkoutsForComparison(uid1: string, uid2: string, trainingDay: string, programBlockId: string): Promise<[SharedWorkout[], SharedWorkout[]]> {
    const [snaps1, snaps2] = await Promise.all([
      getDocs(query(collection(this.firestore, 'sharedWorkouts'), where('ownerUid', '==', uid1))),
      getDocs(query(collection(this.firestore, 'sharedWorkouts'), where('ownerUid', '==', uid2))),
    ]);

    const filter = (snaps: typeof snaps1) =>
      snaps.docs
        .map((d) => this.normalizeSharedWorkout({ id: d.id, ...d.data() }))
        .filter((w) => w.session.trainingDay === trainingDay && w.session.programBlockId === programBlockId)
        .sort((a, b) => b.session.date.localeCompare(a.session.date));

    return [filter(snaps1), filter(snaps2)];
  }

  // ─── Normalizers ────────────────────────────────────────────────────────────

  private normalizeProfile(uid: string, data: Record<string, unknown>): UserProfile {
    const displayName = typeof data['displayName'] === 'string' ? data['displayName'] : 'Unknown';
    return {
      uid,
      displayName,
      avatarInitials: typeof data['avatarInitials'] === 'string' ? data['avatarInitials'] : this.initials(displayName),
      createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : new Date().toISOString(),
      updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : new Date().toISOString(),
    };
  }

  private normalizeFriendRequest(value: unknown): FriendRequest {
    const d = value as Record<string, unknown>;
    const status = ['pending', 'accepted', 'declined'].includes(d['status'] as string)
      ? (d['status'] as FriendshipStatus)
      : 'pending';
    return {
      id: String(d['id'] ?? ''),
      fromUid: String(d['fromUid'] ?? ''),
      fromDisplayName: String(d['fromDisplayName'] ?? ''),
      toUid: String(d['toUid'] ?? ''),
      status,
      createdAt: String(d['createdAt'] ?? new Date().toISOString()),
      updatedAt: String(d['updatedAt'] ?? new Date().toISOString()),
    };
  }

  private normalizeSharedWorkout(value: unknown): SharedWorkout {
    const d = value as Record<string, unknown>;
    const emojis: WorkoutReactionEmoji[] = ['💪', '🔥', '👏', '🏆', '😤'];
    const rawReactions = d['reactions'] && typeof d['reactions'] === 'object' ? d['reactions'] as Record<string, unknown> : {};
    const reactions = Object.fromEntries(
      emojis.map((e) => [e, Array.isArray(rawReactions[e]) ? (rawReactions[e] as WorkoutReaction[]) : []])
    ) as Record<WorkoutReactionEmoji, WorkoutReaction[]>;

    const rawComments = Array.isArray(d['comments']) ? d['comments'] as WorkoutComment[] : [];

    return {
      id: String(d['id'] ?? ''),
      ownerUid: String(d['ownerUid'] ?? ''),
      ownerDisplayName: String(d['ownerDisplayName'] ?? ''),
      session: d['session'] as WorkoutSession,
      caption: typeof d['caption'] === 'string' ? d['caption'] : '',
      reactions,
      comments: rawComments,
      sharedAt: String(d['sharedAt'] ?? new Date().toISOString()),
      updatedAt: String(d['updatedAt'] ?? new Date().toISOString()),
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('');
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  private assertUid(uid: string): string {
    const s = uid.trim();
    if (!s) throw new Error('You must be signed in.');
    return s;
  }
}
