import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

let timerCompleteSheetBundle = '';

const mockModules: Record<string, string> = {
  'auth-context': `
    export function useAuth() {
      return { user: { uid: 'user-e2e' }, loading: false };
    }
  `,
  'ride-log-service': `
    export class RideLogSaveError extends Error {
      constructor(code, message, cause, savedLogId) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = 'RideLogSaveError';
        this.code = code;
        this.savedLogId = savedLogId;
      }
    }

    export const RIDE_LOG_SAVE_TIMEOUT_MS = 10_000;

    let pending;
    export const timerTestControls = {
      calls: 0,
      closeCalls: 0,
      createPendingSave() {
        this.calls += 1;
        return new Promise((resolve, reject) => {
          pending = { resolve, reject };
        });
      },
      resolveSave() {
        pending?.resolve('saved-log');
        pending = undefined;
      },
      rejectTimeout() {
        pending?.reject(new RideLogSaveError(
          'timeout',
          'Saving the ride took too long. It was not confirmed; retrying is safe.',
        ));
        pending = undefined;
      },
      rejectWrite() {
        pending?.reject(new RideLogSaveError(
          'write-failed',
          'Firestore rejected the ride save. Check your connection and try again.',
        ));
        pending = undefined;
      },
      rejectSaved() {
        pending?.reject(new RideLogSaveError(
          'post-write-refresh-failed',
          'Ride saved. The trip summary could not refresh, but retrying will not duplicate this ride.',
          undefined,
          'saved-log',
        ));
        pending = undefined;
      },
    };

    window.__timerTestControls = timerTestControls;

    export function createRideLog() {
      return timerTestControls.createPendingSave();
    }

    export async function submitCrowdReport() {}
  `,
};

const timerMocks: Plugin = {
  name: 'timer-complete-sheet-mocks',
  setup(buildContext) {
    buildContext.onResolve(
      { filter: /^@\/lib\/firebase\/auth-context$/ },
      () => ({ path: 'auth-context', namespace: 'timer-mocks' }),
    );
    buildContext.onResolve(
      { filter: /^@\/lib\/services\/ride-log-service$/ },
      () => ({ path: 'ride-log-service', namespace: 'timer-mocks' }),
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: 'timer-mocks' },
      ({ path }) => ({ contents: mockModules[path], loader: 'js' }),
    );
  },
};

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import TimerCompleteSheet from '../src/components/queue-timer/TimerCompleteSheet';
        import { timerTestControls } from '@/lib/services/ride-log-service';

        function Harness() {
          const [open, setOpen] = useState(false);

          return (
            <main>
              <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
                Open ride completion
              </button>
              {open && (
                <TimerCompleteSheet
                  elapsedMinutes={35}
                  attractionName="Space Mountain"
                  parkId="magic-kingdom"
                  attractionId="space-mountain"
                  parkName="Magic Kingdom"
                  onClose={() => {
                    timerTestControls.closeCalls += 1;
                    setOpen(false);
                  }}
                />
              )}
            </main>
          );
        }

        createRoot(document.getElementById('root')).render(<Harness />);
      `,
      loader: 'tsx',
      resolveDir: __dirname,
      sourcefile: 'timer-complete-sheet-browser-harness.tsx',
    },
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    platform: 'browser',
    write: false,
    plugins: [timerMocks],
  });

  timerCompleteSheetBundle = result.outputFiles[0].text;
});

async function mountTimerCompleteSheet(page: Page) {
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: timerCompleteSheetBundle });

  const trigger = page.getByTestId('trigger');
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

test.describe('TimerCompleteSheet browser focus', () => {
  test('keeps keyboard focus inside the modal throughout a pending save and timeout retry', async ({ page }) => {
    const { dialog, trigger } = await mountTimerCompleteSheet(page);

    await page.getByRole('button', { name: 'Save 🎉' }).click();

    await expect(dialog).toHaveAttribute('aria-busy', 'true');
    await expect(dialog).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => ({
      calls: window.__timerTestControls.calls,
      closeCalls: window.__timerTestControls.closeCalls,
    }))).toEqual({ calls: 1, closeCalls: 0 });

    await page.evaluate(() => window.__timerTestControls.rejectTimeout());

    const retryButton = page.getByRole('button', { name: 'Retry Save' });
    await expect(page.getByRole('alert')).toContainText('took too long');
    await expect(retryButton).toBeEnabled();
    await expect(retryButton).toBeFocused();

    await retryButton.click();
    await expect(dialog).toHaveAttribute('aria-busy', 'true');
    await expect(dialog).toBeFocused();
    await page.evaluate(() => window.__timerTestControls.resolveSave());

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => ({
      calls: window.__timerTestControls.calls,
      closeCalls: window.__timerTestControls.closeCalls,
    }))).toEqual({ calls: 2, closeCalls: 1 });
  });

  test('returns focus to Retry Save after a write failure', async ({ page }) => {
    const { dialog } = await mountTimerCompleteSheet(page);

    await page.getByRole('button', { name: 'Save 🎉' }).click();
    await expect(dialog).toBeFocused();
    await page.evaluate(() => window.__timerTestControls.rejectWrite());

    await expect(page.getByRole('alert')).toContainText('Firestore rejected');
    await expect(page.getByRole('button', { name: 'Retry Save' })).toBeFocused();
  });

  test('focuses the terminal Close action and Escape closes without a duplicate write', async ({ page }) => {
    const { dialog, trigger } = await mountTimerCompleteSheet(page);

    await page.getByRole('button', { name: 'Save 🎉' }).click();
    await expect(dialog).toBeFocused();
    await page.evaluate(() => window.__timerTestControls.rejectSaved());

    await expect(page.getByRole('status')).toContainText('Ride saved.');
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => ({
      calls: window.__timerTestControls.calls,
      closeCalls: window.__timerTestControls.closeCalls,
    }))).toEqual({ calls: 1, closeCalls: 1 });
  });
});
