import { assertValidMessageCatalogs } from '../dist/messages/validate.js';

try {
  assertValidMessageCatalogs();
  console.log('@honey/i18n: message catalogs are valid.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
