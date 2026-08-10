const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const isLocked = (account) => Boolean(account.lockedUntil && account.lockedUntil.getTime() > Date.now());

const lockedMinutesLeft = (account) => Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60000);

const registerFailedAttempt = async (account) => {
  account.failedLoginAttempts = (account.failedLoginAttempts || 0) + 1;
  if (account.failedLoginAttempts >= MAX_ATTEMPTS) {
    account.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
  }
  await account.save();
};

const resetLoginAttempts = async (account) => {
  if (account.failedLoginAttempts || account.lockedUntil) {
    account.failedLoginAttempts = 0;
    account.lockedUntil = null;
    await account.save();
  }
};

module.exports = { isLocked, lockedMinutesLeft, registerFailedAttempt, resetLoginAttempts };
