import { TestBed } from '@angular/core/testing';
import { User } from '@angular/fire/auth';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, firstValueFrom, isObservable } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { authGuard, guestOnlyGuard } from './auth.guard';

async function resolveGuardResult(result: unknown): Promise<unknown> {
  if (isObservable(result)) {
    return firstValueFrom(result);
  }

  return Promise.resolve(result);
}

describe('authGuard', () => {
  let router: Router;
  let userSubject: BehaviorSubject<User | null>;

  beforeEach(async () => {
    userSubject = new BehaviorSubject<User | null>(null);
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user$: userSubject.asObservable(),
          },
        },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
  });

  it('allows authenticated users through', async () => {
    userSubject.next({ uid: 'user-1' } as User);

    const result = await TestBed.runInInjectionContext(() =>
      resolveGuardResult(authGuard({} as never, { url: '/workouts/log' } as never))
    );

    expect(result).toBeTrue();
  });

  it('redirects unauthenticated users to login with returnUrl', async () => {
    userSubject.next(null);

    const result = await TestBed.runInInjectionContext(() =>
      resolveGuardResult(authGuard({} as never, { url: '/history' } as never))
    );

    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fhistory');
  });
});

describe('guestOnlyGuard', () => {
  let router: Router;
  let userSubject: BehaviorSubject<User | null>;

  beforeEach(async () => {
    userSubject = new BehaviorSubject<User | null>(null);
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user$: userSubject.asObservable(),
          },
        },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
  });

  it('redirects signed-in users away from login', async () => {
    userSubject.next({ uid: 'user-1' } as User);

    const result = await TestBed.runInInjectionContext(() =>
      resolveGuardResult(guestOnlyGuard({} as never, { url: '/login' } as never))
    );

    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe('/workouts/log');
  });

  it('allows signed-out users to access login', async () => {
    userSubject.next(null);

    const result = await TestBed.runInInjectionContext(() =>
      resolveGuardResult(guestOnlyGuard({} as never, { url: '/login' } as never))
    );

    expect(result).toBeTrue();
  });
});
