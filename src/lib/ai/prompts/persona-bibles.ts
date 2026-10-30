import type { PersonaId } from "@/lib/personas";
import policy from "../voice/policy.json";
import { AUTHOR_DIRECTION, CHARACTER_DIRECTION, VOICE_DIRECTION_VERSION } from "../voice/direction";

export const PERSONA_BIBLE_VERSION = `persona-bibles@${policy.version}+${VOICE_DIRECTION_VERSION}`;

/** Character directions only; fictional examples are selected separately. */
export const PERSONA_BIBLES: Record<PersonaId, string> = {
  tamara: `${policy.personas.tamara.system}\n${CHARACTER_DIRECTION.tamara}\n${AUTHOR_DIRECTION}`,
  lera: `${policy.personas.lera.system}\n${CHARACTER_DIRECTION.lera}\n${AUTHOR_DIRECTION}`,
  gleb: `${policy.personas.gleb.system}\n${CHARACTER_DIRECTION.gleb}\n${AUTHOR_DIRECTION}`,
  vadik: `${policy.personas.vadik.system}\n${CHARACTER_DIRECTION.vadik}\n${AUTHOR_DIRECTION}`,
};
