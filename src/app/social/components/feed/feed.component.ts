import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../auth/services/auth.service';
import { SocialStorageService } from '../../services/social-storage.service';
import {
  FriendRequest,
  SharedWorkout,
  UserProfile,
  WorkoutReactionEmoji,
} from '../../../workouts/models/workout.models';

const REACTION_EMOJIS: WorkoutReactionEmoji[] = ['💪', '🔥', '👏', '🏆', '😤'];

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './feed.component.html',
  styleUrl: './feed.component.scss',
})
export class FeedComponent implements OnInit {
  readonly feed = signal<SharedWorkout[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly commentInputs = signal<Record<string, string>>({});
  readonly expandedComments = signal<Set<string>>(new Set());
  readonly expandedWorkouts = signal<Set<string>>(new Set());
  readonly myProfile = signal<UserProfile | null>(null);
  readonly friends = signal<FriendRequest[]>([]);

  readonly reactionEmojis = REACTION_EMOJIS;

  constructor(
    private readonly authService: AuthService,
    private readonly socialStorage: SocialStorageService,
  ) {}

  async ngOnInit(): Promise<void> {
    const user = this.authService.user();
    if (!user) return;

    try {
      const [profile, friendships] = await Promise.all([
        this.socialStorage.getProfile(user.uid),
        this.socialStorage.getAcceptedFriends(user.uid),
      ]);

      this.myProfile.set(profile);
      this.friends.set(friendships);

      const friendUids = friendships.map((f) => this.socialStorage.friendUidFrom(f, user.uid));
      const feedItems = await this.socialStorage.getFeedForFriends(friendUids);
      this.feed.set(feedItems);
    } catch (err) {
      this.errorMessage.set('Could not load feed.');
    } finally {
      this.isLoading.set(false);
    }
  }

  get myUid(): string {
    return this.authService.user()?.uid ?? '';
  }

  async toggleReaction(workout: SharedWorkout, emoji: WorkoutReactionEmoji): Promise<void> {
    const profile = this.myProfile();
    if (!profile) {
      this.errorMessage.set('Set up your profile to react!');
      return;
    }
    try {
      const updated = await this.socialStorage.toggleReaction(workout.id, profile.uid, profile.displayName, emoji);
      this.feed.update((items) => items.map((w) => (w.id === updated.id ? updated : w)));
    } catch {
      this.errorMessage.set('Could not update reaction.');
    }
  }

  async submitComment(workout: SharedWorkout): Promise<void> {
    const profile = this.myProfile();
    const text = (this.commentInputs()[workout.id] ?? '').trim();
    if (!profile || !text) return;

    try {
      const updated = await this.socialStorage.addComment(workout.id, profile.uid, profile.displayName, text);
      this.feed.update((items) => items.map((w) => (w.id === updated.id ? updated : w)));
      this.commentInputs.update((m) => ({ ...m, [workout.id]: '' }));
    } catch {
      this.errorMessage.set('Could not post comment.');
    }
  }

  setCommentInput(workoutId: string, value: string): void {
    this.commentInputs.update((m) => ({ ...m, [workoutId]: value }));
  }

  toggleComments(workoutId: string): void {
    this.expandedComments.update((s) => {
      const n = new Set(s);
      n.has(workoutId) ? n.delete(workoutId) : n.add(workoutId);
      return n;
    });
  }

  toggleWorkoutDetails(workoutId: string): void {
    this.expandedWorkouts.update((s) => {
      const n = new Set(s);
      n.has(workoutId) ? n.delete(workoutId) : n.add(workoutId);
      return n;
    });
  }

  isCommentsExpanded(workoutId: string): boolean {
    return this.expandedComments().has(workoutId);
  }

  isWorkoutExpanded(workoutId: string): boolean {
    return this.expandedWorkouts().has(workoutId);
  }

  reactionCount(workout: SharedWorkout, emoji: WorkoutReactionEmoji): number {
    return workout.reactions[emoji]?.length ?? 0;
  }

  didIReact(workout: SharedWorkout, emoji: WorkoutReactionEmoji): boolean {
    return workout.reactions[emoji]?.some((r) => r.uid === this.myUid) ?? false;
  }

  totalReactionCount(workout: SharedWorkout): number {
    return this.reactionEmojis.reduce((sum, e) => sum + this.reactionCount(workout, e), 0);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  trainingDayLabel(day: string): string {
    const labels: Record<string, string> = {
      'lower-a': 'Lower A', 'upper-a': 'Upper A', 'lower-b': 'Lower B', 'upper-b': 'Upper B',
    };
    return labels[day] ?? day;
  }
}
