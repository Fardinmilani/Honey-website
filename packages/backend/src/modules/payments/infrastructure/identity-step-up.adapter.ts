import type { StepUpPort } from '../application/payments.service.js';

/**
 * Adapts the identity module's step-up check to the narrow `StepUpPort`
 * `PaymentsService` depends on. Payments never imports identity's concrete
 * request/response types — only this one method
 * (docs/module-boundaries.md §1: cross-module composition through a public
 * service, never through internals).
 */
export interface IdentityStepUpService {
  requireStepUp(sessionId: string): Promise<void>;
}

export class IdentityStepUpAdapter implements StepUpPort {
  constructor(private readonly identity: IdentityStepUpService) {}

  requireStepUp(sessionId: string): Promise<void> {
    return this.identity.requireStepUp(sessionId);
  }
}
