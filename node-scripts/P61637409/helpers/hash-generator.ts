import { randomBytes, scryptSync } from "crypto";

const generateSaltedHash = (password: string) => {
  const salt = generateSalt();
  // All parameter values are as recommended by CryptoBR
  // https://w.amazon.com/bin/view/AWSCryptoBR/Scrypt/

  const CPU_COST_FACTOR = 32768;
  const BLOCK_SIZE = 8;
  const PARALLELIZATION_PARAMETER = 1;
  const MAX_MEMORY = 128 * CPU_COST_FACTOR * BLOCK_SIZE * 1.5;

  const scryptHash = scryptSync(
    Buffer.from(password, "utf-8"),
    Buffer.from(salt, "base64"),
    32,
    {
      cost: CPU_COST_FACTOR,
      blockSize: BLOCK_SIZE,
      parallelization: PARALLELIZATION_PARAMETER,
      maxmem: MAX_MEMORY,
    }
  );

  return salt + "||" + scryptHash.toString("base64");
};
const generateSalt = () => {
  return randomBytes(16).toString("base64");
};

export const getCredentialsHash = (base64Credentials: string) => {
  const credentials = Buffer.from(base64Credentials, "base64")
    .toString("utf-8")
    .split(":");

  const username = credentials[0];
  const password = credentials[1];

  if (!username || !password) {
    return;
  }

  const saltedHash = generateSaltedHash(password);

  return Buffer.from(`${username}:${saltedHash}`, "utf-8").toString("base64");
};
