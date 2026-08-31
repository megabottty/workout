import { Injectable, Signal } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  authState,
  signInWithPopup,
  signOut
} from '@angular/fire/auth';
import { Observable, shareReplay } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user: Signal<User | null>;
  readonly user$: Observable<User | null>;

  constructor(private readonly auth: Auth) {
    // Derive user$ straight from Firebase so subscribers (route guards) always
    // read the latest auth state synchronously. Bridging through a signal with
    // toObservable defers emissions to the effect scheduler, which made guards
    // observe a stale null right after sign-in.
    this.user$ = authState(this.auth).pipe(
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.user = toSignal(this.user$, { initialValue: null });
  }

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(this.auth, provider);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }
}
