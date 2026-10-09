// Owner: B (Phase 2b; was ui-shell). Loading indicator (lead decision): three paw prints + "Getting the board ready…",
// written into a polite status region when shown (announced once), cleared when hidden.
import { describe, expect, it } from 'vitest';
import { createLoadingIndicator } from '../../../src/ui/overlays/loading-indicator';

describe('loading indicator', () => {
  it('starts hidden, shows the text in a status region, hides and clears it', () => {
    const li = createLoadingIndicator();
    document.body.appendChild(li.el);
    const status = li.el.querySelector('[role="status"]') as HTMLElement;
    expect(li.el.hidden).toBe(true);
    expect(li.isShown()).toBe(false);
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    li.show();
    expect(li.isShown()).toBe(true);
    expect(status.textContent).toBe('Getting the board ready…');
    expect(li.el.querySelectorAll('.loading-paw')).toHaveLength(3);
    expect(li.el.querySelector('.loading-paws')?.getAttribute('aria-hidden')).toBe('true');
    li.hide();
    expect(li.el.hidden).toBe(true);
    expect(status.textContent).toBe('');
    li.destroy();
    expect(li.el.isConnected).toBe(false);
  });
});
