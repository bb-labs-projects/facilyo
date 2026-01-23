import { z } from 'zod';

// Validation messages in German
const messages = {
  required: 'Dieses Feld ist erforderlich',
  email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
  minLength: (min: number) => `Mindestens ${min} Zeichen erforderlich`,
  maxLength: (max: number) => `Maximal ${max} Zeichen erlaubt`,
  invalidFormat: 'Ungültiges Format',
  positiveNumber: 'Muss eine positive Zahl sein',
  invalidPhone: 'Ungültige Telefonnummer',
};

// Login form schema
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, messages.required)
    .email(messages.email),
  password: z
    .string()
    .min(1, messages.required)
    .min(6, messages.minLength(6)),
  rememberMe: z.boolean().optional(),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Profile update schema
export const profileSchema = z.object({
  firstName: z
    .string()
    .min(1, messages.required)
    .max(50, messages.maxLength(50)),
  lastName: z
    .string()
    .min(1, messages.required)
    .max(50, messages.maxLength(50)),
  phone: z
    .string()
    .regex(/^(\+41|0)[0-9\s]{9,14}$/, messages.invalidPhone)
    .optional()
    .or(z.literal('')),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

// Time entry notes schema
export const timeEntryNotesSchema = z.object({
  notes: z
    .string()
    .max(500, messages.maxLength(500))
    .optional(),
});

export type TimeEntryNotesFormData = z.infer<typeof timeEntryNotesSchema>;

// Issue form schema
export const issueSchema = z.object({
  propertyId: z
    .string()
    .uuid(messages.invalidFormat),
  category: z.enum(['damage', 'cleaning', 'safety', 'maintenance', 'other'], {
    errorMap: () => ({ message: messages.required }),
  }),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], {
    errorMap: () => ({ message: messages.required }),
  }),
  title: z
    .string()
    .min(1, messages.required)
    .min(3, messages.minLength(3))
    .max(100, messages.maxLength(100)),
  description: z
    .string()
    .max(1000, messages.maxLength(1000))
    .optional(),
  photoUrls: z
    .array(z.string().url(messages.invalidFormat))
    .max(5, 'Maximal 5 Fotos erlaubt')
    .optional(),
});

export type IssueFormData = z.infer<typeof issueSchema>;

// Checklist item response schema
export const checklistItemResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('checkbox'),
    value: z.boolean(),
  }),
  z.object({
    type: z.literal('text'),
    value: z.string().max(500, messages.maxLength(500)),
  }),
  z.object({
    type: z.literal('number'),
    value: z.number().nonnegative(messages.positiveNumber),
  }),
  z.object({
    type: z.literal('photo'),
    value: z.string().url(messages.invalidFormat),
  }),
]);

export type ChecklistItemResponse = z.infer<typeof checklistItemResponseSchema>;

// Work day schema
export const workDaySchema = z.object({
  notes: z
    .string()
    .max(500, messages.maxLength(500))
    .optional(),
});

export type WorkDayFormData = z.infer<typeof workDaySchema>;

// Property selection schema
export const propertySelectionSchema = z.object({
  propertyId: z
    .string()
    .uuid(messages.invalidFormat),
});

export type PropertySelectionFormData = z.infer<typeof propertySelectionSchema>;

// Custom validation helpers
export const validateEmail = (email: string): boolean => {
  return z.string().email().safeParse(email).success;
};

export const validatePhone = (phone: string): boolean => {
  return /^(\+41|0)[0-9\s]{9,14}$/.test(phone);
};

export const validateUUID = (uuid: string): boolean => {
  return z.string().uuid().safeParse(uuid).success;
};
