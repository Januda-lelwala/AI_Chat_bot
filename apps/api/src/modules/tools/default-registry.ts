import { ToolRegistry } from "./tool-registry.js";
import {
  collectLeadTool,
  createTicketTool,
  humanHandoffTool,
  openUrlTool,
  scrollToSectionTool,
  searchKnowledgeTool
} from "./definitions.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(searchKnowledgeTool);
  registry.register(collectLeadTool);
  registry.register(humanHandoffTool);
  registry.register(openUrlTool);
  registry.register(scrollToSectionTool);
  registry.register(createTicketTool);
  return registry;
}
