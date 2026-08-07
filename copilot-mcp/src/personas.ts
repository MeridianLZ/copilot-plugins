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
      const fused = FUSION_FILES.map((f) => readFileSync(path.join(dir, f), 'utf8').trim()).join(
        '\n\n',
      );
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
