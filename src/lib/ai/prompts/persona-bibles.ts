import type { PersonaId } from "@/lib/personas";
import policy from "../voice/policy.json";

export const PERSONA_BIBLE_VERSION = `persona-bibles@${policy.version}`;

/** Character directions only; fictional examples are selected separately. */
export const PERSONA_BIBLES: Record<PersonaId, string> = {
  tamara: policy.personas.tamara.system,
  lera: policy.personas.lera.system,
  gleb: policy.personas.gleb.system,
  vadik: policy.personas.vadik.system,
};
