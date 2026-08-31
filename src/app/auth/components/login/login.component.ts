import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { LOGIN_REDIRECT_URL } from '../../auth.constants';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  readonly errorMessage = signal('');
  readonly isSubmitting = signal(false);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  async submit(): Promise<void> {
    this.errorMessage.set('');
    try {
      this.isSubmitting.set(true);
      await this.authService.signInWithGoogle();
      // Wait until auth state has actually propagated, otherwise authGuard can
      // still see a signed-out user and bounce us back to the login page.
      await firstValueFrom(
        this.authService.user$.pipe(
          filter((user) => user !== null),
          take(1)
        )
      );
      await this.router.navigateByUrl(LOGIN_REDIRECT_URL);
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
