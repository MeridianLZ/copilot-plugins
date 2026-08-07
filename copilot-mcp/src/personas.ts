import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Persona {
  name: string;
  description: string;
  model: string | undefined;
  systemMessage: string;
}

/** First-class peer copilots exposed as MCP tools. */
export const PERSONA_NAMES = ['chewy', 'buzz', 'goose'] as const;

/** Fusion order defined in each <name>.agent.md. */
const FUSION_FILES = ['system-prompt.md', 'specialized_role.md', 'mission.md'] as const;

/**
 * Identity preamble prepended to the fused persona. The CLI's built-in
 * identity section ("I'm Copilot, ...") otherwise wins self-introductions —
 * a real UX failure: the user never sees the persona they invoked. This
 * overrides NAME/IDENTITY only; safety and tool guardrails are untouched.
 */
function identityPreamble(name: string): string {
  const display = name.charAt(0).toUpperCase() + name.slice(1);
  return [
    `# Identity override (non-negotiable)`,
    `Your name is ${display}. You are the peer copilot "${display}" — a distinct, named member of a multi-agent crew.`,
    `When you introduce yourself, refer to yourself, or sign off, you ALWAYS use the name ${display} and your crew role — never "Copilot", never "CLI assistant", never a generic assistant identity.`,
    `Stay in ${display}'s voice for every reply in this session. Persona voice never overrides safety rules or tool permissions.`,
  ].join('\n');
}

function frontmatterValue(agentMd: string, key: string): string | undefined {
  const match = agentMd.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

/**
 * Load personas from a copilot-home agents dir
 * (`<dir>/<name>/{system-prompt,specialized_role,mission}.md` + `<name>.agent.md`).
 * Fail-soft per persona: a missing/broken persona is skipped with a stderr note
 * so the server still serves the core tools.
 */
export function loadPersonas(personaDir: string): Persona[] {
  const personas: Persona[] = [];
  for (const name of PERSONA_NAMES) {
    const dir = path.join(personaDir, name);
    try {
      const fused = [
        identityPreamble(name),
        ...FUSION_FILES.map((f) => readFileSync(path.join(dir, f), 'utf8').trim()),
      ].join('\n\n');
      let description = `Peer copilot "${name}" (persistent persona session).`;
      let model: string | undefined;
      try {
        const agentMd = readFileSync(path.join(dir, `${name}.agent.md`), 'utf8');
        description = frontmatterValue(agentMd, 'description') ?? description;
        model = frontmatterValue(agentMd, 'model');
      } catch {
        // .agent.md optional — fused persona alone is enough.
      }
      personas.push({ name, description, model, systemMessage: fused });
    } catch (error) {
      console.error(`[copilot-mcp] persona "${name}" not loaded from ${dir}: ${String(error)}`);
    }
  }
  return personas;
}
