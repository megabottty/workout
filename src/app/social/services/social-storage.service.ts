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
  writeBatch,
} from '@angular/fire/firestore';

import {
  FriendNotification,
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

  async saveProfile(uid: string, displayName: string, email?: string): Promise<UserProfile> {
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

    const safeEmail = this.normalizeEmail(email);

    await setDoc(profileRef, {
      ...profile,
      email: safeEmail,
      emailLower: safeEmail.toLowerCase(),
      displayNameLower: safeName.toLowerCase(),
    });

    const publicRef = doc(this.firestore, `publicProfiles/${safeUid}`);
    await setDoc(publicRef, {
      displayName: safeName,
      displayNameLower: safeName.toLowerCase(),
      email: safeEmail,
      emailLower: safeEmail.toLowerCase(),
      avatarInitials: this.initials(safeName),
      updatedAt: now,
    });

    return { uid: safeUid, ...profile, email: safeEmail };
  }

  async getProfile(uid: string): Promise<UserProfile | null> {
    const safeUid = this.assertUid(uid);
    const profileRef = doc(this.firestore, `users/${safeUid}/profile/data`);
    const snapshot = await getDoc(profileRef);
    if (!snapshot.exists()) return null;
    return this.normalizeProfile(safeUid, snapshot.data());
  }

  async findProfilesByDisplayName(searchTerm: string): Promise<UserProfile[]> {
    const term = searchTerm.trim().toLowerCase();
    if (term.length < 2) return [];

    const matchedByUid = new Map<string, UserProfile>();

    try {
      const pubRef = collection(this.firestore, 'publicProfiles');
      const prefixMatches = await getDocs(
        query(
          pubRef,
          where('displayNameLower', '>=', term),
          where('displayNameLower', '<=', term + '\uf8ff'),
          orderBy('displayNameLower'),
        )
      );

      for (const profileDoc of prefixMatches.docs) {
        const normalized = this.normalizeProfile(profileDoc.id, profileDoc.data());
        matchedByUid.set(normalized.uid, normalized);
      }
    } catch {
      // Fall through to scan-based search for environments without required indexes.
    }

    const hydrateFromScanDoc = (uid: string, data: Record<string, unknown>): void => {
      const candidateLower =
        typeof data['displayNameLower'] === 'string'
          ? data['displayNameLower']
          : (typeof data['displayName'] === 'string' ? data['displayName'].toLowerCase() : '');
      if (!candidateLower.startsWith(term)) {
        return;
      }

      matchedByUid.set(uid, this.normalizeProfile(uid, data));
    };

    if (matchedByUid.size === 0) {
      const publicProfiles = await getDocs(collection(this.firestore, 'publicProfiles'));
      for (const profileDoc of publicProfiles.docs) {
        hydrateFromScanDoc(profileDoc.id, profileDoc.data());
      }
    }

    if (matchedByUid.size === 0) {
      const privateProfiles = await getDocs(collectionGroup(this.firestore, 'profile'));
      for (const profileDoc of privateProfiles.docs) {
        const uid = profileDoc.ref.parent.parent?.id;
        if (!uid) {
          continue;
        }
        hydrateFromScanDoc(uid, profileDoc.data());
      }
    }

    return Array.from(matchedByUid.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async findProfileByEmail(email: string): Promise<UserProfile | null> {
    const safeEmail = this.normalizeEmail(email);
    if (!safeEmail) {
      return null;
    }

    const publicProfiles = await getDocs(
      query(collection(this.firestore, 'publicProfiles'), where('emailLower', '==', safeEmail.toLowerCase()))
    );
    if (!publicProfiles.empty) {
      const first = publicProfiles.docs[0];
      return this.normalizeProfile(first.id, first.data());
    }

    const privateProfiles = await getDocs(collectionGroup(this.firestore, 'profile'));
    for (const profileDoc of privateProfiles.docs) {
      const data = profileDoc.data();
      const candidateEmail = typeof data['email'] === 'string' ? data['email'].trim().toLowerCase() : '';
      if (!candidateEmail || candidateEmail !== safeEmail.toLowerCase()) {
        continue;
      }

      const uid = profileDoc.ref.parent.parent?.id;
      if (!uid) {
        continue;
      }

      return this.normalizeProfile(uid, data);
    }

    return null;
  }

  /** Save profile and mirror to publicProfiles/{uid} for cross-user search */
  async savePublicProfile(uid: string, displayName: string, email?: string): Promise<UserProfile> {
    const safeUid = this.assertUid(uid);
    const safeName = displayName.trim();
    if (!safeName) throw new Error('Display name is required.');

    const now = new Date().toISOString();

    const privateRef = doc(this.firestore, `users/${safeUid}/profile/data`);
    const existing = await getDoc(privateRef);
    const createdAt = existing.exists() ? (existing.data()['createdAt'] as string) ?? now : now;

    const profile: Omit<UserProfile, 'uid'> = {
      displayName: safeName,
      email: this.normalizeEmail(email),
      avatarInitials: this.initials(safeName),
      createdAt,
      updatedAt: now,
    };

    await setDoc(privateRef, {
      ...profile,
      displayNameLower: safeName.toLowerCase(),
      emailLower: profile.email ? profile.email.toLowerCase() : '',
    });

    const publicRef = doc(this.firestore, `publicProfiles/${safeUid}`);
    await setDoc(publicRef, {
      displayName: safeName,
      displayNameLower: safeName.toLowerCase(),
      email: profile.email ?? '',
      emailLower: profile.email ? profile.email.toLowerCase() : '',
      avatarInitials: this.initials(safeName),
      updatedAt: now,
    });

    return { uid: safeUid, ...profile };
  }

  // ─── Friend Requests ────────────────────────────────────────────────────────

  async sendFriendRequest(fromUid: string, fromDisplayName: string, toUid: string, fromEmail?: string): Promise<FriendRequest> {
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
      fromEmail: this.normalizeEmail(fromEmail),
      toUid,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const notificationRef = doc(this.firestore, `users/${toUid}/notifications/friend-request__${reqId}`);
    const notification = {
      type: 'friend-request' as const,
      toUid,
      fromUid,
      fromDisplayName,
      fromEmail: this.normalizeEmail(fromEmail),
      requestId: reqId,
      message: `${fromDisplayName} sent you a friend request.`,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    };

    const batch = writeBatch(this.firestore);
    batch.set(reqRef, request);
    batch.set(notificationRef, notification);
    await batch.commit();
    return { id: reqId, ...request };
  }

  async respondToFriendRequest(requestId: string, status: 'accepted' | 'declined'): Promise<void> {
    const reqRef = doc(this.firestore, `friendRequests/${requestId}`);
    await updateDoc(reqRef, { status, updatedAt: new Date().toISOString() });
  }

  async removeFriend(requestId: string): Promise<void> {
    const reqRef = doc(this.firestore, `friendRequests/${requestId}`);
    await updateDoc(reqRef, { status: 'declined', updatedAt: new Date().toISOString() });
  }

  async getIncomingRequests(uid: string): Promise<FriendRequest[]> {
    const safeUid = this.assertUid(uid);
    const snap = await getDocs(
      query(collection(this.firestore, 'friendRequests'), where('toUid', '==', safeUid))
    );
    return snap.docs
      .map((d) => this.normalizeFriendRequest({ id: d.id, ...d.data() }))
      .filter((request) => request.status === 'pending');
  }

  async getAcceptedFriends(uid: string): Promise<FriendRequest[]> {
    const safeUid = this.assertUid(uid);
    const [sent, received] = await Promise.all([
      getDocs(query(collection(this.firestore, 'friendRequests'), where('fromUid', '==', safeUid))),
      getDocs(query(collection(this.firestore, 'friendRequests'), where('toUid', '==', safeUid))),
    ]);

    const all = [
      ...sent.docs.map((d) => this.normalizeFriendRequest({ id: d.id, ...d.data() })),
      ...received.docs.map((d) => this.normalizeFriendRequest({ id: d.id, ...d.data() })),
    ].filter((request) => request.status === 'accepted');

    // Dedupe (shouldn't happen but guard anyway)
    const seen = new Set<string>();
    return all.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  async getUnreadFriendNotifications(uid: string): Promise<FriendNotification[]> {
    const safeUid = this.assertUid(uid);
    const notificationsRef = collection(this.firestore, `users/${safeUid}/notifications`);
    const snapshot = await getDocs(notificationsRef);

    return snapshot.docs
      .map((docSnapshot) => this.normalizeFriendNotification(docSnapshot.id, docSnapshot.data()))
      .filter((notification) => notification.type === 'friend-request' && !notification.isRead)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async markFriendNotificationRead(uid: string, notificationId: string): Promise<void> {
    const safeUid = this.assertUid(uid);
    const notificationRef = doc(this.firestore, `users/${safeUid}/notifications/${notificationId}`);
    await updateDoc(notificationRef, { isRead: true, updatedAt: new Date().toISOString() });
  }

  async markFriendNotificationsForRequestRead(uid: string, requestId: string): Promise<void> {
    const safeUid = this.assertUid(uid);
    const notificationsRef = collection(this.firestore, `users/${safeUid}/notifications`);
    const snapshot = await getDocs(notificationsRef);
    const matches = snapshot.docs.filter((docSnapshot) => {
      const data = docSnapshot.data();
      return data['type'] === 'friend-request' && data['requestId'] === requestId && data['isRead'] !== true;
    });

    if (matches.length === 0) {
      return;
    }

    const batch = writeBatch(this.firestore);
    for (const match of matches) {
      batch.update(match.ref, { isRead: true, updatedAt: new Date().toISOString() });
    }
    await batch.commit();
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
      query(collection(this.firestore, 'sharedWorkouts'), where('ownerUid', '==', safeUid))
    );
    return snap.docs
      .map((d) => this.normalizeSharedWorkout({ id: d.id, ...d.data() }))
      .sort((a, b) => b.sharedAt.localeCompare(a.sharedAt));
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
    const email = typeof data['email'] === 'string' ? data['email'].trim() : '';
    return {
      uid,
      displayName,
      email,
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
      fromEmail: typeof d['fromEmail'] === 'string' ? d['fromEmail'] : '',
      toUid: String(d['toUid'] ?? ''),
      status,
      createdAt: String(d['createdAt'] ?? new Date().toISOString()),
      updatedAt: String(d['updatedAt'] ?? new Date().toISOString()),
    };
  }

  private normalizeFriendNotification(id: string, data: Record<string, unknown>): FriendNotification {
    return {
      id,
      type: 'friend-request',
      toUid: String(data['toUid'] ?? ''),
      fromUid: String(data['fromUid'] ?? ''),
      fromDisplayName: String(data['fromDisplayName'] ?? ''),
      fromEmail: typeof data['fromEmail'] === 'string' ? data['fromEmail'] : '',
      requestId: String(data['requestId'] ?? ''),
      message: String(data['message'] ?? 'You have a friend request.'),
      isRead: data['isRead'] === true,
      createdAt: String(data['createdAt'] ?? new Date().toISOString()),
      updatedAt: String(data['updatedAt'] ?? new Date().toISOString()),
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

  private normalizeEmail(email: string | undefined): string {
    if (!email) {
      return '';
    }
    return email.trim().toLowerCase();
  }
}
