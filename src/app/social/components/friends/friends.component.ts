import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../auth/services/auth.service';
import { SocialStorageService } from '../../services/social-storage.service';
import { FriendRequest, UserProfile } from '../../../workouts/models/workout.models';

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
  readonly friends = signal<FriendRequest[]>([]);
  readonly friendNamesByUid = signal<Record<string, string>>({});

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
    const [incoming, accepted] = await Promise.all([
      this.socialStorage.getIncomingRequests(this.myUid),
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
    this.friends.set(accepted);
    this.friendNamesByUid.set(namesByUid);
  }

  async search(): Promise<void> {
    const term = this.searchQuery().trim();
    if (term.length < 2) return;
    this.isSearching.set(true);
    this.errorMessage.set('');
    try {
      const results = await this.socialStorage.findProfilesByDisplayName(term);
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
      await this.socialStorage.sendFriendRequest(me.uid, myProfile.displayName, profile.uid);
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
      await this.loadFriendsData();
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Could not respond to request.');
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
}
