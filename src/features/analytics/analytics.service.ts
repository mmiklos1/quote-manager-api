import type { ErrorAnalytics } from '../../utilities/errors.js';
import type { Logger } from '../../utilities/logging/logger.js';

/**
 * Structured product events written through the logger as
 * `{ kind: "analytics", event, ...props }`. There is no vendor SDK.
 * Spec events: login_succeeded, login_failed, password_reset_requested,
 * password_reset_completed (B-013). login_failed is emitted from the app
 * error handler when an ApiError carries analytics metadata.
 */
const METHODS = new Set(['google', 'microsoft', 'password']);

const EVENTS = {
  loginSucceeded: 'login_succeeded',
  loginFailed: 'login_failed',
  passwordResetRequested: 'password_reset_requested',
  passwordResetCompleted: 'password_reset_completed',
};

export type AnalyticsProps = ErrorAnalytics;

function allowedProperties(props: AnalyticsProps = {}) {
  const clean: AnalyticsProps = {};
  if (props.method !== undefined) {
    if (!METHODS.has(props.method)) {
      throw new Error('analytics method is not google, microsoft, or password');
    }
    clean.method = props.method;
  }
  if (props.userId !== undefined) {
    clean.userId = props.userId;
  }
  if (props.companyId !== undefined) {
    clean.companyId = props.companyId;
  }
  if (props.errorClass !== undefined) {
    clean.errorClass = props.errorClass;
  }
  return clean;
}

export type Analytics = {
  loginSucceeded(props?: AnalyticsProps): void;
  loginFailed(props?: AnalyticsProps): void;
  passwordResetRequested(props?: AnalyticsProps): void;
  passwordResetCompleted(props?: AnalyticsProps): void;
};

export function createAnalytics(logger: Pick<Logger, 'info'>): Analytics {
  function emit(event: string, props: AnalyticsProps = {}) {
    logger.info({
      kind: 'analytics',
      event,
      ...allowedProperties(props),
    });
  }

  return {
    loginSucceeded(props) {
      emit(EVENTS.loginSucceeded, props);
    },
    loginFailed(props) {
      emit(EVENTS.loginFailed, props);
    },
    passwordResetRequested(props) {
      emit(EVENTS.passwordResetRequested, props);
    },
    passwordResetCompleted(props) {
      emit(EVENTS.passwordResetCompleted, props);
    },
  };
}

export function soleCompanyId(memberships: Array<{ companyId: string }>) {
  if (memberships.length === 1) {
    return memberships[0]?.companyId;
  }
  return undefined;
}
