import { Routes } from '@angular/router';
import { LoginComponent } from './auth/components/login/login.component';
import { authGuard, guestOnlyGuard } from './auth/guards/auth.guard';
import { WorkoutHistoryComponent } from './workouts/components/workout-history/workout-history.component';
import { WorkoutLogComponent } from './workouts/components/workout-log/workout-log.component';

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
];
