# WorkoutApp

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.0.7.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Firebase auth + per-user workouts

This app is wired to Firebase Authentication + Firestore and stores workouts per user at:

`users/{uid}/workouts/{date}__{trainingDay}`

Authentication is required to access `/workouts/log` and `/history`.

Supported sign-in method in-app:
- Google (popup flow)

### One-time project setup

1. `firebase login`
2. `firebase use workoutapp-626b7`
3. `firebase deploy --only firestore:rules`
4. In Firebase Console -> Authentication -> Sign-in method, enable:
   - Google

## Deploy

1. `npm run build`
2. `npm run deploy` (or `npm run deploy:hosting`)

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
