import { TestBed } from '@angular/core/testing';
import { User } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let userSubject: BehaviorSubject<User | null>;
  let authServiceStub: { user$: BehaviorSubject<User | null>; signInWithGoogle: jasmine.Spy };
  let router: Router;
  let component: LoginComponent;

  beforeEach(async () => {
    userSubject = new BehaviorSubject<User | null>(null);
    authServiceStub = {
      user$: userSubject,
      signInWithGoogle: jasmine.createSpy('signInWithGoogle').and.callFake(async () => {
        userSubject.next({ uid: 'user-1' } as User);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, RouterTestingModule],
      providers: [{ provide: AuthService, useValue: authServiceStub }],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    component = TestBed.createComponent(LoginComponent).componentInstance;
  });

  it('sends the user to the log page after signing in', async () => {
    await component.submit();

    expect(authServiceStub.signInWithGoogle).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/workouts/log');
    expect(component.errorMessage()).toBe('');
  });

  it('waits for auth state to report a signed-in user before navigating', async () => {
    authServiceStub.signInWithGoogle.and.callFake(async () => {
      // Simulate Firebase resolving sign-in before auth state propagates.
      setTimeout(() => userSubject.next({ uid: 'user-1' } as User), 0);
    });

    await component.submit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/workouts/log');
  });

  it('surfaces an error and stays put when sign-in fails', async () => {
    authServiceStub.signInWithGoogle.and.rejectWith(new Error('Popup closed'));

    await component.submit();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Popup closed');
    expect(component.isSubmitting()).toBeFalse();
  });
});
