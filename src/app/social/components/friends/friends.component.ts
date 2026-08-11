import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../auth/services/auth.service';
import { SocialStorageService } from '../../services/social-storage.service';
import { FriendNotification, FriendRequest, UserProfile } from '../../../workouts/models/workout.models';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './friends.component.html',
  styleUrl: './friends.component.scss',
})
export class FriendsComponent implements OnInit {
  readonly searchQuery = signal('');
  readonly searchResults = signal<UserProfile[]>([]);
  readonly isSearching = signal(false);

  readonly incomingRequests = signal<FriendRequest[]>([]);
  readonly unreadNotifications = signal<FriendNotification[]>([]);
  readonly friends = signal<FriendRequest[]>([]);
  readonly friendNamesByUid = signal<Record<string, string>>({});
  readonly incomingByUid = signal<Set<string>>(new Set());

  readonly pendingSentIds = signal<Set<string>>(new Set());
  readonly processingIds = signal<Set<string>>(new Set());
  readonly errorMessage = signal('');

  constructor(
    private readonly authService: AuthService,
    private readonly socialStorage: SocialStorageService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadFriendsData();
  }

  get myUid(): string {
    return this.authService.user()?.uid ?? '';
  }

  private async loadFriendsData(): Promise<void> {
    if (!this.myUid) return;
    const [incoming, notifications, accepted] = await Promise.all([
      this.socialStorage.getIncomingRequests(this.myUid),
      this.socialStorage.getUnreadFriendNotifications(this.myUid),
      this.socialStorage.getAcceptedFriends(this.myUid),
    ]);

    const friendUids = Array.from(new Set(
      accepted.map((request) => this.socialStorage.friendUidFrom(request, this.myUid))
    ));
    const profiles = await Promise.all(
      friendUids.map(async (uid) => ({ uid, profile: await this.socialStorage.getProfile(uid) }))
    );
    const namesByUid = profiles.reduce<Record<string, string>>((result, entry) => {
      if (entry.profile?.displayName) {
        result[entry.uid] = entry.profile.displayName;
      }
      return result;
    }, {});

    this.incomingRequests.set(incoming);
    this.unreadNotifications.set(notifications);
    this.friends.set(accepted);
    this.friendNamesByUid.set(namesByUid);
    this.incomingByUid.set(new Set(incoming.map((request) => request.fromUid)));
  }

  async search(): Promise<void> {
    const term = this.searchQuery().trim();
    if (term.length < 2) return;
    this.isSearching.set(true);
    this.errorMessage.set('');
    try {
      const isEmailLookup = term.includes('@');
      const results = isEmailLookup
        ? await this.searchByEmail(term)
        : await this.socialStorage.findProfilesByDisplayName(term);
      this.searchResults.set(results.filter((r) => r.uid !== this.myUid));
    } catch {
      this.errorMessage.set('Search failed. Please try again.');
    } finally {
      this.isSearching.set(false);
    }
  }

  async addFriend(profile: UserProfile): Promise<void> {
    const me = this.authService.user();
    if (!me) return;

    const myProfile = await this.socialStorage.getProfile(me.uid);
    if (!myProfile) {
      this.errorMessage.set('Please set up your profile before adding friends.');
      return;
    }

    this.processingIds.update((s) => new Set([...s, profile.uid]));
    this.errorMessage.set('');
    try {
      await this.socialStorage.sendFriendRequest(me.uid, myProfile.displayName, profile.uid, me.email ?? '');
      this.pendingSentIds.update((s) => new Set([...s, profile.uid]));
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Could not send request.');
    } finally {
      this.processingIds.update((s) => { const n = new Set(s); n.delete(profile.uid); return n; });
    }
  }

  async respond(request: FriendRequest, status: 'accepted' | 'declined'): Promise<void> {
    this.processingIds.update((s) => new Set([...s, request.id]));
    try {
      await this.socialStorage.respondToFriendRequest(request.id, status);
      await this.socialStorage.markFriendNotificationsForRequestRead(this.myUid, request.id);
      await this.loadFriendsData();
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Could not respond to request.');
    } finally {
      this.processingIds.update((s) => { const n = new Set(s); n.delete(request.id); return n; });
    }
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    if (!this.myUid) {
      return;
    }

    this.processingIds.update((s) => new Set([...s, notificationId]));
    try {
      await this.socialStorage.markFriendNotificationRead(this.myUid, notificationId);
      this.unreadNotifications.update((items) => items.filter((item) => item.id !== notificationId));
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Could not mark notification as read.');
    } finally {
      this.processingIds.update((s) => { const n = new Set(s); n.delete(notificationId); return n; });
    }
  }

  async removeFriend(request: FriendRequest): Promise<void> {
    this.processingIds.update((s) => new Set([...s, request.id]));
    this.errorMessage.set('');
    try {
      await this.socialStorage.removeFriend(request.id);
      await this.loadFriendsData();
      const friendUid = this.socialStorage.friendUidFrom(request, this.myUid);
      this.pendingSentIds.update((s) => {
        const next = new Set(s);
        next.delete(friendUid);
        return next;
      });
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Could not remove friend.');
    } finally {
      this.processingIds.update((s) => { const n = new Set(s); n.delete(request.id); return n; });
    }
  }

  friendDisplayName(request: FriendRequest): string {
    const friendUid = this.socialStorage.friendUidFrom(request, this.myUid);
    return this.friendNamesByUid()[friendUid] ?? request.fromDisplayName ?? friendUid;
  }

  isProcessing(id: string): boolean {
    return this.processingIds().has(id);
  }

  isPending(uid: string): boolean {
    return this.pendingSentIds().has(uid);
  }

  isAlreadyFriend(uid: string): boolean {
    return this.friends().some((r) =>
      r.fromUid === uid || r.toUid === uid
    );
  }

  hasIncomingPending(uid: string): boolean {
    return this.incomingByUid().has(uid);
  }

  private async searchByEmail(email: string): Promise<UserProfile[]> {
    const profile = await this.socialStorage.findProfileByEmail(email);
    return profile ? [profile] : [];
  }
}
