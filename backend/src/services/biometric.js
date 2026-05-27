import { encryptTemplate, hashTemplate } from '../utils/crypto.js';

export function createBiometricPayload(template) {
  return {
    biometricHash: hashTemplate(template),
    biometricTemplate: encryptTemplate(template)
  };
}

export function validateBiometricMatch(candidateTemplate, storedHash) {
  const candidateHash = hashTemplate(candidateTemplate);
  const matched = candidateHash === storedHash;
  return {
    matched,
    confidence: matched ? 0.96 : 0.28
  };
}
