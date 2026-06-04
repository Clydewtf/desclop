import type { LicenseState } from "../../shared/domain/types";

export function canUseLocalCore(input: { licenseState: LicenseState }) {
  return (
    input.licenseState === "free_beta" ||
    input.licenseState === "founder" ||
    input.licenseState === "trial"
  );
}
