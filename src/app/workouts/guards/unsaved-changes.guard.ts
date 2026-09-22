import { CanDeactivateFn } from '@angular/router';

/**
 * Any component that wants to be protected by `unsavedChangesGuard` should
 * implement this interface so we can ask it (rather than the router) whether
 * it's safe to navigate away. Returning a promise lets the component flush a
 * pending auto-save before answering.
 */
export interface ComponentCanDeactivate {
  canDeactivate(): boolean | Promise<boolean>;
}

/**
 * Gives the component a chance to persist in-flight edits before navigation.
 * Only prompts when the component reports it could not save, so the normal
 * auto-save path never interrupts the user. Pairs with a `window:beforeunload`
 * listener on the component for tab close/refresh, which cannot await.
 */
export const unsavedChangesGuard: CanDeactivateFn<ComponentCanDeactivate> = async (component) => {
  const canLeave = await component.canDeactivate();
  if (canLeave) {
    return true;
  }

  return typeof window === 'undefined'
    ? true
    : window.confirm('Your latest changes could not be saved. Leave anyway?');
};
