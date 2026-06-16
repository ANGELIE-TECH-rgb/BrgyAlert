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
    console.error('Error checking login rate limit status:', err);
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
    console.error('Error recording failed login attempt:', err);
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
    console.error('Error resetting login attempts:', err);
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
    console.error('Error checking signup rate limit status:', err);
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
    console.error('Error recording signup attempt:', err);
    return { locked: false, secondsRemaining: 0 };
  }
}
