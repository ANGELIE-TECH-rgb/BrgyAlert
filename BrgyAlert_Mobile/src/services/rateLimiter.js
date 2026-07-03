import AsyncStorage from '@react-native-async-storage/async-storage';

const LOGIN_ATTEMPTS_KEY = '@brgyalert_login_attempts';
const LOGIN_LOCKOUT_KEY = '@brgyalert_login_lockout';
const SIGNUP_ATTEMPTS_KEY = '@brgyalert_signup_attempts';
const SIGNUP_LOCKOUT_KEY = '@brgyalert_signup_lockout';

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000; // 1 minute window
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes lockout

const SIGNUP_MAX_ATTEMPTS = 3;
const SIGNUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const SIGNUP_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

/**
 * Checks if the device is currently locked out of logging in.
 * @returns {Promise<{locked: boolean, secondsRemaining: number}>}
 */
export async function checkLoginStatus() {
  try {
    const lockoutStr = await AsyncStorage.getItem(LOGIN_LOCKOUT_KEY);
    if (!lockoutStr) {
      return { locked: false, secondsRemaining: 0 };
    }

    const lockoutUntil = parseInt(lockoutStr, 10);
    const now = Date.now();

    if (now < lockoutUntil) {
      return {
        locked: true,
        secondsRemaining: Math.ceil((lockoutUntil - now) / 1000),
      };
    }

    // Lockout has expired, clean up
    await AsyncStorage.removeItem(LOGIN_LOCKOUT_KEY);
    await AsyncStorage.removeItem(LOGIN_ATTEMPTS_KEY);
    return { locked: false, secondsRemaining: 0 };
  } catch (err) {
    console.log('Error checking login rate limit status:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}

/**
 * Records a failed login attempt. If attempts exceed the threshold, locks the device.
 * @returns {Promise<{locked: boolean, secondsRemaining: number}>}
 */
export async function recordFailedLogin() {
  try {
    const now = Date.now();
    const attemptsStr = await AsyncStorage.getItem(LOGIN_ATTEMPTS_KEY);
    let attempts = { count: 0, firstAttemptTime: now };

    if (attemptsStr) {
      attempts = JSON.parse(attemptsStr);
    }

    // If the window has expired, reset attempts
    if (now - attempts.firstAttemptTime > LOGIN_WINDOW_MS) {
      attempts.count = 1;
      attempts.firstAttemptTime = now;
    } else {
      attempts.count += 1;
    }

    await AsyncStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));

    if (attempts.count >= LOGIN_MAX_ATTEMPTS) {
      const lockoutUntil = now + LOGIN_LOCKOUT_MS;
      await AsyncStorage.setItem(LOGIN_LOCKOUT_KEY, String(lockoutUntil));
      return { locked: true, secondsRemaining: Math.ceil(LOGIN_LOCKOUT_MS / 1000) };
    }

    return { locked: false, secondsRemaining: 0 };
  } catch (err) {
    console.log('Error recording failed login attempt:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}

/**
 * Resets the login attempts and lockout timestamp.
 */
export async function resetLoginAttempts() {
  try {
    await AsyncStorage.removeItem(LOGIN_ATTEMPTS_KEY);
    await AsyncStorage.removeItem(LOGIN_LOCKOUT_KEY);
  } catch (err) {
    console.log('Error resetting login attempts:', err);
  }
}

/**
 * Checks if the device is currently locked out of registering.
 * @returns {Promise<{locked: boolean, secondsRemaining: number}>}
 */
export async function checkSignUpStatus() {
  try {
    const lockoutStr = await AsyncStorage.getItem(SIGNUP_LOCKOUT_KEY);
    if (!lockoutStr) {
      return { locked: false, secondsRemaining: 0 };
    }

    const lockoutUntil = parseInt(lockoutStr, 10);
    const now = Date.now();

    if (now < lockoutUntil) {
      return {
        locked: true,
        secondsRemaining: Math.ceil((lockoutUntil - now) / 1000),
      };
    }

    // Lockout has expired, clean up
    await AsyncStorage.removeItem(SIGNUP_LOCKOUT_KEY);
    await AsyncStorage.removeItem(SIGNUP_ATTEMPTS_KEY);
    return { locked: false, secondsRemaining: 0 };
  } catch (err) {
    console.log('Error checking signup rate limit status:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}

/**
 * Records a sign-up attempt. If attempts exceed the threshold, locks the device.
 * @returns {Promise<{locked: boolean, secondsRemaining: number}>}
 */
export async function recordSignUpAttempt() {
  try {
    const now = Date.now();
    const attemptsStr = await AsyncStorage.getItem(SIGNUP_ATTEMPTS_KEY);
    let attempts = { count: 0, windowStartTime: now };

    if (attemptsStr) {
      attempts = JSON.parse(attemptsStr);
    }

    // If the window has expired, reset attempts
    if (now - attempts.windowStartTime > SIGNUP_WINDOW_MS) {
      attempts.count = 1;
      attempts.windowStartTime = now;
    } else {
      attempts.count += 1;
    }

    await AsyncStorage.setItem(SIGNUP_ATTEMPTS_KEY, JSON.stringify(attempts));

    if (attempts.count >= SIGNUP_MAX_ATTEMPTS) {
      const lockoutUntil = now + SIGNUP_LOCKOUT_MS;
      await AsyncStorage.setItem(SIGNUP_LOCKOUT_KEY, String(lockoutUntil));
      return { locked: true, secondsRemaining: Math.ceil(SIGNUP_LOCKOUT_MS / 1000) };
    }

    return { locked: false, secondsRemaining: 0 };
  } catch (err) {
    console.log('Error recording signup attempt:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}

const REPORT_LIMIT_MS = 60 * 1000; // 1 minute window
const REPORT_LAST_TIME_KEY = '@brgyalert_last_report_time';

/**
 * Checks if the device is currently rate-limited for report submissions.
 * @returns {Promise<{locked: boolean, secondsRemaining: number}>}
 */
export async function checkReportStatus() {
  try {
    const lastTimeStr = await AsyncStorage.getItem(REPORT_LAST_TIME_KEY);
    if (!lastTimeStr) {
      return { locked: false, secondsRemaining: 0 };
    }

    const lastTime = parseInt(lastTimeStr, 10);
    const now = Date.now();
    const diff = now - lastTime;

    if (diff < REPORT_LIMIT_MS) {
      return {
        locked: true,
        secondsRemaining: Math.ceil((REPORT_LIMIT_MS - diff) / 1000),
      };
    }

    // Rate limit expired, clean up
    await AsyncStorage.removeItem(REPORT_LAST_TIME_KEY);
    return { locked: false, secondsRemaining: 0 };
  } catch (err) {
    console.log('Error checking report rate limit status:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}

/**
 * Records a successful report submission.
 */
export async function recordReportSubmission() {
  try {
    await AsyncStorage.setItem(REPORT_LAST_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.log('Error recording report submission timestamp:', err);
  }
}

// Chat message rate limiting (lenient)
const CHAT_MESSAGE_LIMIT_MS = 5 * 1000; // 5 seconds window
const CHAT_MESSAGE_LAST_TIME_KEY = '@brgyalert_last_chat_message_time';
const PANIC_LIMIT_MS = 60 * 1000; // 1 minute window
const PANIC_LAST_TIME_KEY = '@brgyalert_last_panic_time';

/**
 * Checks if the device is currently rate-limited for emergency panic triggers.
 * @returns {Promise<{locked: boolean, secondsRemaining: number}>}
 */
export async function checkPanicStatus() {
  try {
    const lastTimeStr = await AsyncStorage.getItem(PANIC_LAST_TIME_KEY);
    if (!lastTimeStr) {
      return { locked: false, secondsRemaining: 0 };
    }

    const lastTime = parseInt(lastTimeStr, 10);
    const now = Date.now();
    const diff = now - lastTime;

    if (diff < PANIC_LIMIT_MS) {
      return {
        locked: true,
        secondsRemaining: Math.ceil((PANIC_LIMIT_MS - diff) / 1000),
      };
    }

    // Rate limit expired, clean up
    await AsyncStorage.removeItem(PANIC_LAST_TIME_KEY);
    return { locked: false, secondsRemaining: 0 };
  } catch (err) {
    console.log('Error checking panic rate limit status:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}

/**
 * Records a successful emergency panic trigger.
 */
export async function recordPanicTrigger() {
  try {
    await AsyncStorage.setItem(PANIC_LAST_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.log('Error recording panic trigger timestamp:', err);
  }
}

/**
 * Checks if the device is currently rate-limited for citizen chat messages.
 * @returns {Promise<{locked: boolean, secondsRemaining: number}>}
 */
export async function checkChatMessageStatus() {
  try {
    const lastTimeStr = await AsyncStorage.getItem(CHAT_MESSAGE_LAST_TIME_KEY);
    if (!lastTimeStr) {
      return { locked: false, secondsRemaining: 0 };
    }
    const lastTime = parseInt(lastTimeStr, 10);
    const now = Date.now();
    const diff = now - lastTime;
    if (diff < CHAT_MESSAGE_LIMIT_MS) {
      return {
        locked: true,
        secondsRemaining: Math.ceil((CHAT_MESSAGE_LIMIT_MS - diff) / 1000),
      };
    }
    // Rate limit expired, clean up
    await AsyncStorage.removeItem(CHAT_MESSAGE_LAST_TIME_KEY);
    return { locked: false, secondsRemaining: 0 };
  } catch (err) {
    console.log('Error checking chat message rate limit status:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}

/**
 * Records a successful citizen chat message send.
 */
export async function recordChatMessageSent() {
  try {
    await AsyncStorage.setItem(CHAT_MESSAGE_LAST_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.log('Error recording chat message timestamp:', err);
  }
}

// Chat edit / delete rate limiting (5 seconds)
const CHAT_EDIT_LIMIT_MS = 5 * 1000;
const CHAT_EDIT_LAST_TIME_KEY = '@brgyalert_last_chat_edit_time';

/**
 * Checks if the device is currently rate-limited for editing or deleting chat messages.
 * @returns {Promise<{locked: boolean, secondsRemaining: number}>}
 */
export async function checkChatEditStatus() {
  try {
    const lastTimeStr = await AsyncStorage.getItem(CHAT_EDIT_LAST_TIME_KEY);
    if (!lastTimeStr) {
      return { locked: false, secondsRemaining: 0 };
    }
    const lastTime = parseInt(lastTimeStr, 10);
    const now = Date.now();
    const diff = now - lastTime;
    if (diff < CHAT_EDIT_LIMIT_MS) {
      return {
        locked: true,
        secondsRemaining: Math.ceil((CHAT_EDIT_LIMIT_MS - diff) / 1000),
      };
    }
    await AsyncStorage.removeItem(CHAT_EDIT_LAST_TIME_KEY);
    return { locked: false, secondsRemaining: 0 };
  } catch (err) {
    console.log('Error checking chat edit rate limit status:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}

/**
 * Records a message edit or deletion operation.
 */
export async function recordChatEditPerformed() {
  try {
    await AsyncStorage.setItem(CHAT_EDIT_LAST_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.log('Error recording chat edit timestamp:', err);
  }
}
