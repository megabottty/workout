import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '@angular/fire/auth';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './auth/services/auth.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly user = this.authService.user;
  readonly theme = this.themeService.resolved;

  constructor(
    private readonly authService: AuthService,
    private readonly themeService: ThemeService,
  ) {}

  toggleTheme(): void {
    this.themeService.toggle();
  }

  initialsFor(user: User): string {
    const source = (user.displayName || user.email || '').trim();
    if (!source) {
      return '?';
    }
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
    return initials || source[0].toUpperCase();
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
  }
}
