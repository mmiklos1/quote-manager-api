const METHODS = new Set(['google', 'microsoft', 'password']);

const EVENTS = {
  loginSucceeded: 'login_succeeded',
  loginFailed: 'login_failed',
  passwordResetRequested: 'password_reset_requested',
  passwordResetCompleted: 'password_reset_completed',
};

function allowedProperties(props) {
  const clean = {};
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

export function createAnalytics(logger) {
  function emit(event, props) {
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

export function soleCompanyId(memberships) {
  if (memberships.length === 1) {
    return memberships[0].companyId;
  }
  return undefined;
}
