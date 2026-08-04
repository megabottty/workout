import { Routes } from '@angular/router';
import { LoginComponent } from './auth/components/login/login.component';
import { authGuard, guestOnlyGuard } from './auth/guards/auth.guard';
import { WorkoutHistoryComponent } from './workouts/components/workout-history/workout-history.component';
import { WorkoutLogComponent } from './workouts/components/workout-log/workout-log.component';
import { ProfileComponent } from './social/components/profile/profile.component';
import { FriendsComponent } from './social/components/friends/friends.component';
import { FeedComponent } from './social/components/feed/feed.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'workouts/log',
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'workouts/log',
    component: WorkoutLogComponent,
    canActivate: [authGuard],
  },
  {
    path: 'history',
    component: WorkoutHistoryComponent,
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    component: ProfileComponent,
    canActivate: [authGuard],
  },
  {
    path: 'friends',
    component: FriendsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'feed',
    component: FeedComponent,
    canActivate: [authGuard],
  },
];
