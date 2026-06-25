import type { z } from "zod";

export function zodToOpenAiSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const shape = getShape(schema);
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const field = unwrapOptional(value as z.ZodTypeAny);
    properties[key] = zodFieldToJsonSchema(field.schema);
    if (!field.optional) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function getShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  const def = schema._def as { shape?: unknown };
  if (typeof def.shape === "function") {
    return def.shape() as Record<string, z.ZodTypeAny>;
  }
  if (def.shape && typeof def.shape === "object") {
    return def.shape as Record<string, z.ZodTypeAny>;
  }
  return {};
}

function unwrapOptional(schema: z.ZodTypeAny): { schema: z.ZodTypeAny; optional: boolean } {
  const typeName = schema._def.typeName as string;
  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    return {
      schema: (schema._def as { innerType: z.ZodTypeAny }).innerType,
      optional: true
    };
  }
  if (typeName === "ZodNullable") {
    return {
      schema: (schema._def as { innerType: z.ZodTypeAny }).innerType,
      optional: true
    };
  }
  return { schema, optional: false };
}

function zodFieldToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const typeName = schema._def.typeName as string;
  if (typeName === "ZodString") {
    return { type: "string" };
  }
  if (typeName === "ZodNumber") {
    return { type: "number" };
  }
  if (typeName === "ZodBoolean") {
    return { type: "boolean" };
  }
  if (typeName === "ZodArray") {
    return {
      type: "array",
      items: zodFieldToJsonSchema((schema._def as { type: z.ZodTypeAny }).type)
    };
  }
  if (typeName === "ZodRecord" || typeName === "ZodObject") {
    return { type: "object" };
  }
  if (typeName === "ZodEnum") {
    return {
      type: "string",
      enum: (schema._def as { values: string[] }).values
    };
  }
  return { type: "string" };
}
