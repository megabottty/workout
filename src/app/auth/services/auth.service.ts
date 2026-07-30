import { Injectable, Signal } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  authState,
  signInWithPopup,
  signOut
} from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user: Signal<User | null>;
  readonly user$: Observable<User | null>;

  constructor(private readonly auth: Auth) {
    this.user = toSignal(authState(this.auth), { initialValue: null });
    this.user$ = toObservable(this.user);
  }

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(this.auth, provider);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }
}
