import type { AdminMessages } from '@honey/i18n';
export function stateLabel(messages: AdminMessages, state: string): string {
  const key = `state${state}`;
  for (const [name, label] of Object.entries(messages)) if (name === key) return label;
  return state === 'fa' ? messages.faTranslation : state === 'en' ? messages.enTranslation : state;
}
