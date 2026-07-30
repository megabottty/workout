import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

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
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  async submit(): Promise<void> {
    this.errorMessage.set('');
    try {
      this.isSubmitting.set(true);
      await this.authService.signInWithGoogle();
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const destination = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/workouts/log';
      await this.router.navigateByUrl(destination);
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
