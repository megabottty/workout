import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../../auth/services/auth.service';
import { SocialStorageService } from '../../services/social-storage.service';
import { UserProfile } from '../../../workouts/models/workout.models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  readonly profile = signal<UserProfile | null>(null);
  readonly displayNameInput = signal('');
  readonly isSaving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  constructor(
    private readonly authService: AuthService,
    private readonly socialStorage: SocialStorageService,
  ) {}

  async ngOnInit(): Promise<void> {
    const user = this.authService.user();
    if (!user) return;

    const existing = await this.socialStorage.getProfile(user.uid);
    if (existing) {
      this.profile.set(existing);
      this.displayNameInput.set(existing.displayName);
    } else {
      // Pre-fill from Google display name if available
      const googleName = (user as { displayName?: string }).displayName ?? '';
      this.displayNameInput.set(googleName);
    }
  }

  async saveProfile(): Promise<void> {
    const user = this.authService.user();
    if (!user) return;

    const name = this.displayNameInput().trim();
    if (!name) {
      this.errorMessage.set('Please enter a display name.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const saved = await this.socialStorage.savePublicProfile(user.uid, name);
      this.profile.set(saved);
      this.successMessage.set('Profile saved! 🎉');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
