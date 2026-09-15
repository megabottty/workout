import { CanDeactivateFn } from '@angular/router';

/**
 * Any component that wants to be protected by `unsavedChangesGuard` should
 * implement this interface so we can ask it (rather than the router) whether
 * it's safe to navigate away.
 */
export interface ComponentCanDeactivate {
  canDeactivate(): boolean;
}

/**
 * Blocks in-app navigation away from a component with unsaved changes unless
 * the user confirms they want to discard them. Pairs with a
 * `window:beforeunload` listener on the component for browser tab close/
 * refresh, which the router guard cannot intercept.
 */
export const unsavedChangesGuard: CanDeactivateFn<ComponentCanDeactivate> = (component) => {
  if (!component.canDeactivate()) {
    return typeof window === 'undefined'
      ? true
      : window.confirm('You have unsaved changes. Leave without saving?');
  }

  return true;
};
