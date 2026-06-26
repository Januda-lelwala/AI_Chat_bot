import { ToolRegistry } from "./tool-registry.js";
import {
  collectLeadTool,
  createTicketTool,
  highlightElementTool,
  humanHandoffTool,
  openUrlTool,
  prefillFormTool,
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
  registry.register(highlightElementTool);
  registry.register(prefillFormTool);
  registry.register(createTicketTool);
  return registry;
}
