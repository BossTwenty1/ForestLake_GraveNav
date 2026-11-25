export type PasswordValidationResult = {
  valid: boolean;
  error: string | null;
  checks: {
    minLength: boolean;
    hasLetter: boolean;
    hasNumber: boolean;
  };
};

export const STAFF_PASSWORD_MIN_LENGTH = 8;
export const STAFF_PASSWORD_MAX_LENGTH = 128;

export function validateStaffPassword(password: string): PasswordValidationResult {
  const value = typeof password === "string" ? password : "";
  const minLength = value.length >= STAFF_PASSWORD_MIN_LENGTH && value.length <= STAFF_PASSWORD_MAX_LENGTH;
  const hasLetter = /[A-Za-z]/.test(value);
  const hasNumber = /\d/.test(value);

  if (value.length < STAFF_PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${STAFF_PASSWORD_MIN_LENGTH} characters long.`,
      checks: { minLength, hasLetter, hasNumber },
    };
  }
  if (value.length > STAFF_PASSWORD_MAX_LENGTH) {
    return {
      valid: false,
      error: `Password must be ${STAFF_PASSWORD_MAX_LENGTH} characters or fewer.`,
      checks: { minLength, hasLetter, hasNumber },
    };
  }
  if (!hasLetter || !hasNumber) {
    return {
      valid: false,
      error: "Password must include at least one letter and one number.",
      checks: { minLength, hasLetter, hasNumber },
    };
  }

  return {
    valid: true,
    error: null,
    checks: { minLength, hasLetter, hasNumber },
  };
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%-_";
const ALL_CHARS = UPPER + LOWER + DIGITS + SYMBOLS;

function randomIndex(max: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

export function generateStaffPassword(length = 14): string {
  const target = Math.max(10, Math.min(length, 32));
  const chars: string[] = [
    UPPER[randomIndex(UPPER.length)],
    LOWER[randomIndex(LOWER.length)],
    DIGITS[randomIndex(DIGITS.length)],
    SYMBOLS[randomIndex(SYMBOLS.length)],
  ];
  while (chars.length < target) {
    chars.push(ALL_CHARS[randomIndex(ALL_CHARS.length)]);
  }
  // Fisher-Yates shuffle using crypto randomness
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join("");
}
