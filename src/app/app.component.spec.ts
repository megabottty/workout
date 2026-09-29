import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';

import { AuthService } from './auth/services/auth.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: signal(null),
            signOut: jasmine.createSpy('signOut'),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render app title in header', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand__name')?.textContent).toContain('Workout Tracker');
  });

  it('toggles between light and dark mode and remembers the choice', () => {
    localStorage.removeItem('theme');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const before = app.theme();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.theme-toggle')!.click();
    fixture.detectChanges();

    const after = app.theme();
    expect(after).not.toBe(before);
    expect(document.documentElement.getAttribute('data-theme')).toBe(after);
    expect(localStorage.getItem('theme')).toBe(after);

    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('theme');
  });
});
